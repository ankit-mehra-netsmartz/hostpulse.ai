import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8" data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8" data-testid="text-effective-date">Effective Date: {currentDate}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-foreground/90 leading-relaxed">
              Welcome to HostPulse ("Company," "we," "us," or "our"). We are committed to protecting 
              your privacy and ensuring the security of your personal information. This Privacy Policy 
              explains how we collect, use, disclose, and safeguard your information when you visit our 
              website and use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            <p className="text-foreground/90 leading-relaxed mb-4">
              We collect information that you provide directly to us, as well as information collected 
              automatically when you use our services.
            </p>
            
            <h3 className="text-xl font-medium mb-3">Personal Information</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li>Name and contact information (email address, phone number)</li>
              <li>Account credentials and authentication information</li>
              <li>Property and listing information you provide</li>
              <li>Guest reviews and communication data</li>
              <li>Payment and billing information</li>
              <li>Profile information and preferences</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6">Automatically Collected Information</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li>Device information (IP address, browser type, operating system)</li>
              <li>Usage data (pages visited, features used, time spent)</li>
              <li>Cookies and similar tracking technologies</li>
              <li>Log data and analytics information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="text-foreground/90 leading-relaxed mb-4">
              We use the information we collect for various purposes, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li>Providing, maintaining, and improving our services</li>
              <li>Processing transactions and managing your account</li>
              <li>Analyzing guest reviews and generating AI-powered insights</li>
              <li>Sending you updates, newsletters, and marketing communications</li>
              <li>Personalizing your experience and providing tailored recommendations</li>
              <li>Responding to your inquiries and providing customer support</li>
              <li>Conducting research and analytics to improve our products</li>
              <li>Complying with legal obligations and protecting our rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Marketing Communications</h2>
            <p className="text-foreground/90 leading-relaxed">
              We may use your personal information to send you marketing communications about our 
              products, services, promotions, and events that may be of interest to you. This includes 
              email newsletters, product updates, special offers, and industry insights. You can 
              opt-out of receiving marketing communications at any time by clicking the "unsubscribe" 
              link in any marketing email or by contacting us directly. Please note that even if you 
              opt-out of marketing communications, we may still send you transactional or 
              service-related messages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Information Sharing and Disclosure</h2>
            <p className="text-foreground/90 leading-relaxed mb-4">
              We may share your information in the following circumstances:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li><strong>Service Providers:</strong> With third-party vendors who perform services on our behalf (hosting, analytics, payment processing)</li>
              <li><strong>Integrations:</strong> With third-party platforms you choose to connect (property management systems, Notion, etc.)</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
              <li><strong>With Your Consent:</strong> When you have given us permission to share your information</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Data Security</h2>
            <p className="text-foreground/90 leading-relaxed">
              We implement appropriate technical and organizational measures to protect your personal 
              information against unauthorized access, alteration, disclosure, or destruction. These 
              measures include encryption, secure data storage, access controls, and regular security 
              assessments. However, no method of transmission over the Internet or electronic storage 
              is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
            <p className="text-foreground/90 leading-relaxed">
              We retain your personal information for as long as necessary to fulfill the purposes 
              for which it was collected, including to satisfy legal, accounting, or reporting 
              requirements. When determining retention periods, we consider the amount, nature, and 
              sensitivity of the data, the potential risk of harm from unauthorized use or disclosure, 
              and applicable legal requirements.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Your Rights and Choices</h2>
            <p className="text-foreground/90 leading-relaxed mb-4">
              Depending on your location, you may have certain rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/90">
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-Out:</strong> Opt-out of marketing communications and certain data processing</li>
            </ul>
            <p className="text-foreground/90 leading-relaxed mt-4">
              To exercise these rights, please contact us using the information provided below.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Cookies and Tracking Technologies</h2>
            <p className="text-foreground/90 leading-relaxed">
              We use cookies and similar tracking technologies to collect information about your 
              browsing activities and to personalize your experience. You can control cookie settings 
              through your browser preferences. Please note that disabling cookies may affect the 
              functionality of our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Third-Party Links</h2>
            <p className="text-foreground/90 leading-relaxed">
              Our services may contain links to third-party websites or services. We are not 
              responsible for the privacy practices of these third parties. We encourage you to 
              review the privacy policies of any third-party sites you visit.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Children's Privacy</h2>
            <p className="text-foreground/90 leading-relaxed">
              Our services are not intended for individuals under the age of 18. We do not knowingly 
              collect personal information from children. If we become aware that we have collected 
              personal information from a child, we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Changes to This Privacy Policy</h2>
            <p className="text-foreground/90 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any 
              material changes by posting the new Privacy Policy on this page and updating the 
              "Effective Date" at the top. We encourage you to review this Privacy Policy 
              periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
            <p className="text-foreground/90 leading-relaxed">
              If you have any questions about this Privacy Policy or our privacy practices, 
              please contact us at:
            </p>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-foreground font-medium">HostPulse</p>
              <p className="text-foreground/90">Email: privacy@hostpulse.com</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. California Privacy Rights</h2>
            <p className="text-foreground/90 leading-relaxed">
              If you are a California resident, you may have additional rights under the California 
              Consumer Privacy Act (CCPA), including the right to know what personal information we 
              collect, the right to request deletion of your personal information, and the right to 
              opt-out of the sale of your personal information. We do not sell personal information 
              as defined by the CCPA.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} HostPulse. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
