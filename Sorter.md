**Product Requirements Document**

**Product Name:** Outlook Inbox Category Sorter  
**Owner:** Herminia Hernandez, PsyD  
**Version:** Draft v2  
**Goal:** Use browser-based control to review all messages in the Outlook Inbox and apply, update, or remove the correct existing Outlook category, while preserving read/unread status and leaving uncertain items uncategorized.

**1. Purpose**

Create a browser-controlled workflow that intelligently categorizes emails in the Outlook Inbox using the existing Outlook categories below:

-   **1: Needs Response**
-   **2: FYI**
-   **26-27 Applicant Follow Up**
-   **3: Waiting for Reply**
-   **4: Done**

The system should support efficient inbox triage while preserving the current state of each message.

**2. Problem Statement**

Inbox messages currently require manual review and categorization. This takes time and adds cognitive load. A browser-based assistant should be able to open Outlook Inbox messages, interpret message content and context, and apply the most appropriate existing category while following strict handling rules.

**3. Objective**

Reduce manual inbox triage time by enabling browser-based message review and category assignment in Outlook without disrupting the user’s workflow.

**4. Success Criteria**

The solution is successful if it can:

-   Review all messages directly in the Outlook web Inbox, including already categorized messages
-   Apply one of the approved categories accurately when confidence is sufficient
-   Update an existing category when it is no longer correct
-   Remove an incorrect category when no confident replacement can be determined
-   Leave messages in the **Inbox**
-   Preserve **read/unread state**
-   Avoid changing folders, flags, archive status, delete status, or any other message properties
-   Leave an email uncategorized when confidence is too low

**5. In Scope**

-   Outlook Inbox messages only
-   Browser-based interaction with Outlook
-   Reading subject line, sender, preview text, and full message as needed
-   Applying one existing category per message
-   Reviewing already categorized Inbox messages
-   Updating an existing approved category when a better-fit approved category is identified
-   Removing an existing approved category if it appears incorrect and no confident replacement can be assigned
-   Preserving message read/unread status
-   Leaving uncertain emails uncategorized
-   Working through messages in batches or date ranges

**6. Out of Scope**

-   Moving emails to folders
-   Marking emails read or unread as part of classification logic
-   Sending replies
-   Drafting replies
-   Deleting, archiving, flagging, snoozing, or forwarding emails
-   Creating new categories
-   Changing category names or colors
-   Processing non-Inbox folders unless explicitly expanded in a future phase

**7. User Story**

As a user, I want a browser-controlled assistant to review my Outlook Inbox and apply the correct category so that I can triage email faster without changing the status or location of any message.

**8. Category Definitions and Decision Rules**

**1: Needs Response**

Apply when the message reasonably requires action, reply, decision, approval, confirmation, scheduling response, or follow-up from the user.

Examples:

-   Direct questions
-   Meeting requests needing a response
-   Requests for approval, documents, input, or confirmation
-   Time-sensitive follow-ups
-   Emails where the sender is clearly waiting on the user

Do not apply if:

-   The request was already clearly resolved in the thread
-   The email is informational only
-   The email is waiting on someone else, not the user

**2: FYI**

Apply when the message is informational and does not require direct action or reply from the user at this time.

Examples:

-   Announcements
-   Updates
-   Courtesy copies
-   Shared information for awareness
-   General notifications with no clear ask

Do not apply if:

-   There is an explicit or implied action needed from the user
-   The email belongs under applicant follow-up

**26-27 Applicant Follow Up**

Apply when the message relates to recruitment, applications, interviews, placements, follow-up, or communications with 2026-2027 applicants or applicant processes.

Examples:

-   Applicant status updates
-   Interview coordination
-   Follow-up with trainees or candidates
-   Application materials
-   Ranking, recruitment, portal, or interview logistics for the 26-27 cycle

Do not apply if:

-   The email is about a different hiring or training issue unrelated to applicant follow-up for this cycle

**3: Waiting for Reply**

Apply when the user has likely already acted and is now waiting on another person’s response, confirmation, or next step.

Examples:

-   Someone replying to acknowledge receipt and saying they will get back to the user
-   Ongoing threads where the next move belongs to someone else
-   Threads where the user previously asked for something and the current message indicates pending follow-through by others

Important:  
This category depends on message context. If it is not clear that the user is now waiting on someone else, do not force this label.

**4: Done**

Apply when the message thread appears complete and no further action is needed.

Examples:

-   Thank-you and closure emails
-   Confirmations where all needed action is finished
-   Informational closure on a resolved issue
-   Finalized scheduling or completed task acknowledgment

Do not apply if:

-   There is any unresolved ask
-   The user may still need to respond
-   The thread is still active or pending

**Default rule for ambiguity**

When the content, thread context, or action status is unclear, do not guess. Leave the message uncategorized.

**Re-categorization rule**

Existing categories should not be treated as final. The system should reassess them during review and update them when the latest thread context supports a different category.

**Category removal rule**

If an existing approved category appears incorrect and no replacement category can be assigned confidently, the system should remove the category and leave the email uncategorized.

**9. Classification Priority**

When multiple categories could apply, use this priority order:

1.  **26-27 Applicant Follow Up**
2.  **1: Needs Response**
3.  **3: Waiting for Reply**
4.  **4: Done**
5.  **2: FYI**

This helps ensure that applicant-related emails are consistently captured first and that action-oriented emails are not mislabeled as informational.

**10. Core Functional Requirements**

**FR1. Inbox-only review**

The system must only review messages currently in the Outlook Inbox.

**FR2. Category-only action**

The only allowed modification is assigning, updating, or removing one of the existing Outlook categories listed above.

**FR3. Preserve read/unread state**

If a message is unread before review, it must remain unread after categorization.  
If a message is read before review, it must remain read after categorization.

**FR4. No folder changes**

The system must not move messages to any folder, archive, delete, or otherwise relocate them.

**FR5. No message state changes beyond category**

The system must not modify:

-   flags
-   reminders
-   importance
-   junk status
-   follow-up status
-   conversation mute settings

**FR6. Safe uncertainty handling**

If the correct category cannot be determined with enough confidence, the system must leave the email uncategorized.

**FR7. Message-by-message reasoning**

The system must evaluate subject, sender, thread context, and email body when needed before assigning a category.

**FR8. Thread-aware classification**

When possible, the system should consider thread history to avoid misclassifying resolved or pending emails.

**FR9. Secondary review and category correction**

The system must review all Inbox messages, including messages that already have one of the approved categories. If the current category is no longer the best fit based on the latest thread content, message state, or action status, the system should replace it with the more accurate approved category.

**FR10. Remove incorrect category when needed**

If a message already has an approved category but that category no longer appears correct, and no replacement category can be determined confidently, the system may remove the existing category and leave the message uncategorized.

**11. Non-Functional Requirements**

**Accuracy**

The system should prioritize precision over aggressive categorization.

**Reversibility**

Actions should be limited so errors are easy to review and fix manually.

**Safety**

The system should never perform destructive actions.

**Consistency**

The same email patterns should yield the same category decisions over time.

**Visibility**

The categorization logic should be transparent enough for the user to audit outcomes.

**12. Workflow**

**Step 1: Load Inbox**

Open Outlook Inbox in browser view.

**Step 2: Capture message state**

For each email, determine:

-   current read/unread state
-   current category status
-   subject
-   sender
-   preview
-   timestamp
-   thread context if needed

**Step 2b: Review existing category**

For each email, determine whether it already has one of the approved categories and assess whether that category still fits based on the latest thread state.

**Step 3: Review content**

Open or preview the message as needed to determine category.

**Step 4: Assign category**

Apply the single best-fit category from the approved list only if confidence is sufficient.

**Step 4b: Update or remove category if needed**

If a message already has a category but a different approved category is a better fit, replace the existing category with the more accurate one. If the existing category appears incorrect and no better category can be assigned confidently, remove the category and leave the message uncategorized.

**Step 5: Restore state if needed**

If opening the email changed it from unread to read, the system must explicitly mark it back to unread before moving on.

**Step 6: Skip uncertain items**

If the email cannot be categorized confidently, leave it uncategorized and move on.

**Step 7: Continue**

Repeat for the target set of Inbox messages.

**13. Edge Cases**

**Ambiguous thread**

If a thread contains mixed signals and no clear action state, leave uncategorized.

**Unread emails that must be opened to classify**

If browser interaction marks them as read, restore unread before leaving the message.

**Existing category present**

Previously assigned categories should be reassessed and may be updated or removed if they are no longer accurate.

**Auto-generated emails**

Use content, not sender type alone. Some automated emails still require response.

**Long threads**

Use most recent relevant state, while considering whether the thread is resolved or pending.

**14. Permissions and Constraints**

The browser-controlled process must operate only within the user’s accessible Outlook session and must not attempt any action beyond visual review and category assignment.

**15. Acceptance Criteria**

A message is considered correctly processed only if all of the following are true:

-   It remains in the Inbox
-   Its original read/unread state is preserved
-   No other message property was changed
-   The most accurate approved category is applied after review, even if that requires changing or removing a prior category
-   If no category can be determined confidently, the message remains uncategorized

**16. Test Cases**

**Test 1**

Unread email asking, “Can you confirm your availability for Thursday?”  
Expected:

-   Category: **1: Needs Response**
-   Message remains unread

**Test 2**

Read email sharing an FYI update on staffing changes with no ask  
Expected:

-   Category: **2: FYI**
-   Message remains read

**Test 3**

Unread email from an applicant about interview scheduling for 2026-27  
Expected:

-   Category: **26-27 Applicant Follow Up**
-   Message remains unread

**Test 4**

Read thread where the user already sent requested documents and the latest message says, “Thanks, I’ll review and get back to you”  
Expected:

-   Category: **3: Waiting for Reply**
-   Message remains read

**Test 5**

Read thread confirming a meeting was completed and no next steps remain  
Expected:

-   Category: **4: Done**
-   Message remains read

**Test 6**

Unread or read email with mixed context and no clear next step  
Expected:

-   Category: **None**
-   Message remains in original read/unread state
-   Email remains uncategorized

**Test 7**

Read email previously labeled **1: Needs Response**, but the latest thread message shows the issue is resolved  
Expected:

-   Category updated to **4: Done** or removed if closure is still ambiguous
-   Message remains read

**Test 8**

Unread email previously labeled **2: FYI**, but the latest message includes a direct request for action  
Expected:

-   Category updated to **1: Needs Response**
-   Message remains unread

**Test 9**

Read email previously labeled **3: Waiting for Reply**, but review shows no clear pending response and no confident replacement category  
Expected:

-   Existing category removed
-   Email left uncategorized
-   Message remains read

**17. Risks**

-   Opening unread messages in Outlook may auto-mark them as read
-   Short previews may not provide enough context for accurate classification
-   Some threads may require human judgment
-   Over-categorization may reduce trust if low-confidence choices are forced

**18. Recommended Guardrails**

-   Do not categorize when confidence is low
-   Process in limited batches first
-   Audit a sample after each batch
-   Keep a simple action log for review, if technically possible
-   Favor leaving items uncategorized over making weak guesses

**19. Future Enhancements**

-   Confidence scoring
-   User-tunable decision rules
-   Sender-based exceptions
-   Date-range filtering
-   “Only uncategorized messages” mode
-   Review queue for ambiguous emails

**20. Summary Requirement Statement**

The browser-based Outlook inbox sorter must review all messages in the Inbox, including messages already categorized, and apply, update, or remove the approved Outlook category based on the best available message and thread context. If no category can be determined with confidence, the email should remain uncategorized. It must preserve the existing read/unread state of every message and make no changes to folders or other message properties.
