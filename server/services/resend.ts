import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendIntegrationSuggestionEmail(params: {
  userName: string;
  userEmail: string;
  workspaceName: string;
  integrationName: string;
  integrationDescription: string;
}) {
  const { client, fromEmail } = await getUncachableResendClient();
  
  if (!fromEmail) {
    throw new Error('Resend fromEmail is not configured');
  }
  
  const { userName, userEmail, workspaceName, integrationName, integrationDescription } = params;
  
  const safeUserName = escapeHtml(userName);
  const safeUserEmail = escapeHtml(userEmail);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeIntegrationName = escapeHtml(integrationName);
  const safeIntegrationDescription = escapeHtml(integrationDescription);
  
  const htmlContent = `
    <h2>New Integration Suggestion</h2>
    <p><strong>From:</strong> ${safeUserName} (${safeUserEmail})</p>
    <p><strong>Workspace:</strong> ${safeWorkspaceName}</p>
    <hr />
    <h3>Requested Integration</h3>
    <p><strong>Integration:</strong> ${safeIntegrationName}</p>
    <h3>What they want it to do</h3>
    <p>${safeIntegrationDescription.replace(/\n/g, '<br />')}</p>
  `;
  
  const textContent = `
New Integration Suggestion

From: ${userName} (${userEmail})
Workspace: ${workspaceName}

Requested Integration: ${integrationName}

What they want it to do:
${integrationDescription}
  `;

  const result = await client.emails.send({
    from: fromEmail,
    to: 'derek@hostpulse.ai',
    subject: `Integration Suggestion: ${integrationName} - from ${userName}`,
    html: htmlContent,
    text: textContent,
  });

  return result;
}
