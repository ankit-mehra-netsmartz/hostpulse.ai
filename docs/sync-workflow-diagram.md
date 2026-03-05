# Property Sync Workflow: 11 Listings, 95 Reservations

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER TRIGGERS SYNC                                  │
│                    (Click "Sync All Properties")                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 1: DATA EXTRACTION                               │
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │ Listing 1   │    │ Listing 2   │    │ Listing 3   │    ...  (11 total)  │
│  │ 8 reserv.   │    │ 12 reserv.  │    │ 6 reserv.   │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
│                                                                             │
│  Hospitable API → Fetch reservations, reviews, messages for each listing   │
│  Total: 95 unprocessed reservations gathered                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PHASE 2: SSE CONNECTION                               │
│                                                                             │
│  POST /api/listings/analyze-all-reservations-stream                        │
│  Body: { listingIds: [11 listing IDs] }                                    │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ SSE Events:                                                          │  │
│  │  • init: { totalReservations: 95, listingsCount: 11 }               │  │
│  │  • listing_progress: per-listing updates                             │  │
│  │  • reservation_complete: per-reservation updates                     │  │
│  │  • heartbeat: every 15 seconds                                       │  │
│  │  • complete: final stats                                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: AI BATCH PROCESSING                             │
│                                                                             │
│  Configuration:                                                             │
│  • Batch Size: 8 reservations per batch                                    │
│  • Parallel Batches: 6 concurrent                                          │
│  • Total Batches: ceil(95/8) = 12 batches                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    BATCH EXECUTION TIMELINE                         │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Time ─────────────────────────────────────────────────────────▶   │   │
│  │                                                                     │   │
│  │  Wave 1: ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │   │
│  │          │Batch 1 │ │Batch 2 │ │Batch 3 │ │Batch 4 │ │Batch 5 │    │   │
│  │          │8 res.  │ │8 res.  │ │8 res.  │ │8 res.  │ │8 res.  │    │   │
│  │          └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │   │
│  │          ┌────────┐                                                │   │
│  │          │Batch 6 │   (6 batches run in parallel)                  │   │
│  │          │8 res.  │                                                │   │
│  │          └────────┘                                                │   │
│  │              │                                                      │   │
│  │              ▼  (wait for all 6 to complete)                       │   │
│  │                                                                     │   │
│  │  Wave 2: ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │   │
│  │          │Batch 7 │ │Batch 8 │ │Batch 9 │ │Batch10 │ │Batch11 │    │   │
│  │          │8 res.  │ │8 res.  │ │8 res.  │ │8 res.  │ │8 res.  │    │   │
│  │          └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │   │
│  │          ┌────────┐                                                │   │
│  │          │Batch12 │   (remaining 7 reservations)                   │   │
│  │          │7 res.  │                                                │   │
│  │          └────────┘                                                │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   PHASE 4: SINGLE BATCH PROCESSING                          │
│                                                                             │
│  For each batch of 8 reservations:                                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  1. BUILD CONTEXT                                                   │   │
│  │     ┌──────────────────────────────────────────────────────────┐   │   │
│  │     │ For each reservation:                                     │   │
│  │     │  • id, guestName, checkIn, checkOut                      │   │
│  │     │  • publicReview, privateRemarks, guestRating             │   │
│  │     │  • conversationHistory (guest messages only)             │   │
│  │     └──────────────────────────────────────────────────────────┘   │   │
│  │                          │                                          │   │
│  │                          ▼                                          │   │
│  │  2. AI ANALYSIS (OpenAI gpt-4.1-mini)                              │   │
│  │     ┌──────────────────────────────────────────────────────────┐   │   │
│  │     │ Prompt: "reservation_analysis" from admin prompts table   │   │
│  │     │                                                           │   │
│  │     │ Input: Property context + 8 reservations' data           │   │
│  │     │                                                           │   │
│  │     │ Output (JSON):                                            │   │
│  │     │ [                                                         │   │
│  │     │   {                                                       │   │
│  │     │     "reservation_id": "...",                              │   │
│  │     │     "tags": [                                             │   │
│  │     │       {                                                   │   │
│  │     │         "name": "Loved the kitchen",                      │   │
│  │     │         "sentiment": "positive",                          │   │
│  │     │         "priority": "medium",                             │   │
│  │     │         "summary": "Guest appreciated...",                │   │
│  │     │         "verbatim_evidence": "The kitchen was...",        │   │
│  │     │         "theme_name": "Amenities",                        │   │
│  │     │         "suggested_task": { title, description }          │   │
│  │     │       }                                                   │   │
│  │     │     ]                                                     │   │
│  │     │   }                                                       │   │
│  │     │ ]                                                         │   │
│  │     └──────────────────────────────────────────────────────────┘   │   │
│  │                          │                                          │   │
│  │                          ▼                                          │   │
│  │  3. TAG CREATION                                                    │   │
│  │     ┌──────────────────────────────────────────────────────────┐   │   │
│  │     │ For each tag from AI response:                           │   │
│  │     │  • Normalize fields (snake_case → camelCase)             │   │
│  │     │  • Match to existing theme OR set pendingThemeName       │   │
│  │     │  • Set createdAt = reservation.checkOutDate              │   │
│  │     │  • Insert into tags table                                │   │
│  │     └──────────────────────────────────────────────────────────┘   │   │
│  │                          │                                          │   │
│  │                          ▼                                          │   │
│  │  4. TASK CREATION (if suggested_task provided)                     │   │
│  │     ┌──────────────────────────────────────────────────────────┐   │   │
│  │     │ Create AI-suggested task linked to tag                   │   │
│  │     │ Status: "ai_suggested" (requires user acceptance)        │   │
│  │     └──────────────────────────────────────────────────────────┘   │   │
│  │                          │                                          │   │
│  │                          ▼                                          │   │
│  │  5. MARK PROCESSED                                                  │   │
│  │     ┌──────────────────────────────────────────────────────────┐   │   │
│  │     │ ALL 8 reservations marked isProcessed = true             │   │
│  │     │ (Even if AI didn't return tags for some)                 │   │
│  │     └──────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 5: THEME PROMOTION                                │
│                                                                             │
│  After all batches complete:                                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ For each unique pendingThemeName:                                   │   │
│  │  • Count tags with this pending theme                               │   │
│  │  • If count >= 5: PROMOTE to real theme                            │   │
│  │    - Create theme in themes table                                   │   │
│  │    - Update all matching tags: themeId = new theme, clear pending  │   │
│  │  • If count < 5: Keep as pending (may promote on future syncs)     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 6: NOTION AUTO-SYNC (Optional)                     │
│                                                                             │
│  If workspace has Notion connected with autoSync enabled:                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ For each newly created tag:                                         │   │
│  │  • Sync to Notion database                                          │   │
│  │  • Update tag.notionPageId                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 7: COMPLETION                                  │
│                                                                             │
│  SSE Final Event:                                                          │
│  {                                                                         │
│    type: "complete",                                                       │
│    totalReservations: 95,                                                  │
│    reservationsAnalyzed: 95,                                               │
│    tagsCreated: ~250,                                                      │
│    tasksCreated: ~40,                                                      │
│    themesPromoted: 3,                                                      │
│    listingsProcessed: 11                                                   │
│  }                                                                         │
│                                                                             │
│  Frontend: Progress bar reaches 100%, success notification shown           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Detailed Batch Math

```
Total Reservations: 95
Batch Size: 8
Parallel Batches: 6

Number of Batches: ceil(95 / 8) = 12 batches

Batch Distribution:
┌─────────┬──────────────┬─────────────┐
│ Batch # │ Reservations │ Cumulative  │
├─────────┼──────────────┼─────────────┤
│    1    │      8       │      8      │
│    2    │      8       │     16      │
│    3    │      8       │     24      │
│    4    │      8       │     32      │
│    5    │      8       │     40      │
│    6    │      8       │     48      │  ← Wave 1 Complete
│    7    │      8       │     56      │
│    8    │      8       │     64      │
│    9    │      8       │     72      │
│   10    │      8       │     80      │
│   11    │      8       │     88      │
│   12    │      7       │     95      │  ← Wave 2 Complete
└─────────┴──────────────┴─────────────┘

Parallel Execution Waves:
• Wave 1: Batches 1-6 run simultaneously (48 reservations)
• Wave 2: Batches 7-12 run simultaneously (47 reservations)
```

## SSE Event Sequence

```
Timeline of SSE Events:

T+0ms     → init { totalReservations: 95, listingsCount: 11 }
T+100ms   → listing_progress { listingId: "...", message: "Analyzing 8 reservations" }
T+200ms   → listing_progress { listingId: "...", message: "Analyzing 12 reservations" }
...
T+2000ms  → reservation_complete { current: 8, total: 95 }
T+2100ms  → reservation_complete { current: 16, total: 95 }
...
T+15000ms → heartbeat { type: "heartbeat" }
...
T+45000ms → reservation_complete { current: 95, total: 95 }
T+45100ms → complete { tagsCreated: 250, tasksCreated: 40, themesPromoted: 3 }
```

## Frontend Progress Modal

```
┌─────────────────────────────────────────────────┐
│  Analyzing 11 properties...                     │
│                                                 │
│  ████████████████████████░░░░░░░░░  75%        │
│  72 / 95 reservations                          │
│                                                 │
│  Tags created: 187                              │
│  Tasks suggested: 32                            │
│                                                 │
│  Currently: Ranch w/ king bed - pets, groups   │
│             Batch 9 of 12                       │
│                                                 │
│  [Minimize]                                     │
└─────────────────────────────────────────────────┘
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ If AI API fails for a batch:                                               │
│  • Log error, mark batch reservations as processed anyway                  │
│  • Continue with next batch (don't fail entire sync)                       │
│  • Final stats will show discrepancy                                       │
│                                                                             │
│ If SSE connection drops:                                                   │
│  • Frontend detects disconnection                                          │
│  • Shows "Reconnecting..." message                                         │
│  • On page refresh, checks localStorage for active sync                    │
│  • Reconnects to SSE endpoint to resume progress updates                   │
└─────────────────────────────────────────────────────────────────────────────┘
```
