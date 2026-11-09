# WeighToGo User's Guide

## 1. About this guide

WeighToGo is a child-growth and nutrition record system for authorized Barangay Nutrition Scholars (BNS) and Municipal Nutrition Action Office (MNAO) users. It supports child registration, growth assessments, supplement tracking, reports, and barangay-level monitoring.

The application has two role-based workspaces:

- **BNS** users see records for their assigned barangay and can register and manage children, record assessments and supplements, and submit monthly report data.
- **MNAO** users can review consolidated information across barangays, inspect child profiles, view health trends, and use the barangay map. The MNAO workspace is desktop-only.

The labels and available controls can vary with the signed-in role, screen size, data, and network state. The guide describes the application pages and controls currently available.

## 2. Sign in

1. Open WeighToGo in a supported browser and go to the sign-in page.
2. Read the **Privacy Policy** dialog. It explains that child and health information is used for the municipal nutrition program and must be kept private.
3. Tick **I have read and agree to the Privacy Policy**. The login form becomes available after agreeing.
4. Enter the account's **Email** and **Password**.
5. To reveal or hide the password while entering it, use the eye button beside the password field.
6. Select **LOG IN**.
7. BNS users are sent to their barangay Masterlist. MNAO users are sent to Health Trends.

The **LOG IN** button remains disabled until the Privacy Policy is accepted and required credentials are entered. If sign-in fails, read the error displayed below the fields and correct the credentials or connection before trying again. Logging in requires an internet connection.

**MNAO on mobile:** MNAO accounts cannot access the MNAO workspace from a mobile device or mobile-sized viewport. If an MNAO account is used on mobile, a notice explains that a desktop or laptop is required. Select **I understand** or the close button, then sign in from a desktop.

## 3. Shared navigation and application controls

### Sidebar and navigation

The sidebar shows the signed-in email and role. Its links depend on the role:

| Role | Navigation pages |
|---|---|
| BNS | Masterlist; Vitamins & Deworming; Monthly Report |
| MNAO | Health Trends; Masterlist; Reports; Barangay Map |

- Select a page name to open that page.
- Select **Log Out** to end the local session and return to sign-in.
- On a narrow screen, select the menu button in the top bar to open the sidebar. Select the close button, a navigation link, or the shaded backdrop to close it.

### Refresh and data freshness

Many data pages show an **Updated … ago** message and a **Refresh** button.

1. Select **Refresh** to request the latest data immediately.
2. While the page says **Updating…**, wait for the request to finish.
3. If an error banner includes **Retry**, select it to reload the affected data.

Some pages retain saved or previously loaded data while refreshing. Check the offline banner and update timestamp if the displayed information may be stale.

### Offline status and queued changes

WeighToGo can display saved information and queue some changes when the device is offline. An offline banner explains when saved data is being shown. Changes made offline are stored on the device until the connection returns; they are not confirmed as server-saved until they sync.

- Queued changes sync automatically as soon as the connection returns. While the app is open, WeighToGo also retries every few seconds when a reconnect attempt fails, so you normally do not need to do anything.
- **Sync now** in the banner or panel is only needed if you want to force an immediate attempt (for example, after resolving an entry).
- The floating **… to sync** badge opens the **Sync queue** panel.
- Queue entries show their operation, time, status, number of attempts when applicable, and any error or result note.
- Select **Sync now** in the panel to attempt all queued entries.
- For a failed or blocked entry, select **Retry** to requeue it or **Discard** to remove it from this device.
- For a conflicted entry, select **Keep mine** to send the local edit as the latest change, or **Use server** to discard the local edit and keep the server version.
- Select **Close** or the close button to dismiss the panel.

The queue panel can also show the time of the last sync. Resolve failed and conflicted entries rather than assuming they were applied. A pending/queued notice means a change still needs to sync.

### Installing the app

When available, the **Install WeighToGo** banner offers:

- **Install** on supported browsers to open the browser's installation prompt.
- On iOS Safari, **How to install** displays steps: use Safari's Share button, choose **Add to Home Screen**, then confirm with **Add**. Select **Hide steps** to collapse them.
- Select the **X** button to dismiss the banner.

The install banner may not appear when the app is already installed or when it was recently dismissed.

## 4. BNS workspace

### 4.1 Masterlist

The Masterlist is the assigned barangay's child roster. The page header includes **+ Register Child** and summary tiles for registered children, children checked in the current assessment period, and children pending in that period. The roster includes child name, parent/guardian, gender, age in months, purok/sitio, and checkup status.

#### Find and filter children

1. Type part or all of a child's name in **Search**.
2. Use **Purok / Sitio** to select a specific purok or **All puroks**.
3. Use **Checkup Status** to choose **All statuses**, **Checked**, or **Pending**.
4. Select **Clear filters** to restore the full roster.
5. Use **Previous** and **Next** to move between pages. The page size adapts to the screen.

The results message shows how many children match the filters. An empty-results message offers **Clear filters** when applicable.

#### Open and manage a child

Select a child's row (or focus it and press Enter/Space) to open the child profile. The profile includes tabs for Personal Info, Monthly Assessment, Checkup History, and Vitamins & Deworming. See [Child profile and management](#6-child-profile-and-management).

#### Register a child

Select **+ Register Child** to open the registration form. See [Register a child](#5-register-a-child).

### 4.2 Vitamins & Deworming

This page lists children who currently have a Vitamin A or deworming dose due. The dose windows are based on the child's age. Summary tiles show the number of children needing a dose, total doses due, and children with overdue doses.

#### Search, filter, and navigate

1. Enter a child's name in **Search**.
2. Select a **Purok / Sitio** or **All puroks**.
3. Use **Dose Status** to show **All due** or **Overdue only**.
4. Select **Clear filters** to remove active filters.
5. Use **Previous** and **Next** to move through the results.

Select **Refresh** to reload the due list. If data cannot be loaded, select **Retry** in the warning banner. A success notice says **No children currently need a dose** when the current due list is empty.

#### Manage a child's supplements

Select **Manage Supplements** in a row, or select the row, to open the child profile directly on the Vitamins & Deworming tab. Each supplement schedule displays age brackets, first/second-dose slots where applicable, completion progress, and a next-step hint.

- Select **Give** to record a due dose.
- Select **Give • late** for an overdue dose.
- A recorded dose displays a check and administration date; it cannot be marked a second time from the schedule.
- **Opens [date/age]** indicates a waiting dose. For a second dose, the waiting interval is six months after the first-dose date.
- A locked first/second slot, upcoming bracket, closed dose, missed dose, or skipped dose is informational rather than an action button.
- Select **Earlier closed** or **Upcoming** to expand those schedule groups.

The schedule shows a confirmation or error after an attempt. If marked while offline, it is shown as saved on the device and will sync later. Use the Sync queue controls if it fails or needs review.

### 4.3 Monthly Report

This page shows the assigned barangay's monthly assessment data and nutritional-status breakdown.

#### Choose month and filter statuses

1. Use the **Month** field to choose the reporting month.
2. Review the Overview card for the total registered and assessed children. The WFA, HFA, and WFL/H cards summarize the counts in each status.
3. In **Masterlist Report Data**, choose a **Nutrition Status** filter to narrow the assessment rows. Select **Clear filters** to return to all statuses.
4. Use **Previous** and **Next** to page through the table.

The table includes address/purok, caregiver, child, Indigenous Person group, sex, birth and measurement dates, weight, height, age, and WFA, HFA, and WFL/H results.

#### Print and submit

- Select **Print Report** to print the report and the currently filtered assessment rows. The printout includes the month, barangay, selected status filter, record count, and print date.
- Select **Submit to Admin** to send this month's report to the MNAO.
- After successful submission, the button changes to **Resubmit** and a confirmation explains the admin can view the data. A later resubmission updates existing entries or appends new checkups rather than duplicating previously submitted records.
- If submitted while offline, the page says the submission is saved on the device and will send when online. Confirm the result in the Sync queue.
- A not-yet-submitted notice indicates MNAO cannot yet see this barangay's report data.

**Assessment period note:** January, February, and March are treated as one January–March assessment period. Only one assessment per child is allowed in that period. The page may label a selected month as part of this shared reporting window.

## 5. Register a child

Open the form with **+ Register Child** from the BNS Masterlist.

### Child Information

- **First Name** — required.
- **Middle Name** — optional.
- **Last Name** — required.
- **Suffix** — optional.
- **Date of Birth** — required; future dates and children older than 59 months cannot be registered.
- **Gender** — select Male or Female.

### Parent / Guardian

- **Full Name** — required.
- **Contact Number** — required; enter an 11-digit Philippine mobile number beginning with `09`.

### Location

- **Barangay** is filled with the signed-in BNS user's assigned barangay and cannot be changed here.
- **Purok** is required.
- Tick **Indigenous Person (IP)** when applicable.

### Save or cancel

1. Complete all required fields and review the spelling and birthdate.
2. Select **Register**. The form checks required values, name formatting, phone format, age limit, and possible duplicate name/birthdate records.
3. Correct any error shown in the form and submit again.
4. Select **Cancel** or the close button to leave without registering.

The form saves an unfinished draft on the device and may restore it if reopened later. Select **Clear form** in the restored-draft notice to remove the saved entries and start over. A successful offline registration appears temporarily on the roster and is queued to sync.

## 6. Child profile and management

Open a child by selecting a row on the BNS Masterlist or Vitamins & Deworming page.

The profile header shows the child's name, purok/barangay, age, and gender. Select a tab to switch sections; select the close button or click outside the dialog to close it.

### 6.1 Personal Info

The read view displays birthdate, barangay, Indigenous Person status, registration date, parent/guardian name, and contact number. Where available, the contact number can be selected to call the guardian.

For BNS:

1. Select **Edit Profile**.
2. Update **Full Name**, **Gender**, **Purok / Sitio**, **Parent / Guardian**, **Parent Contact**, or **Indigenous Person (IP)** as needed. The birthdate and barangay are displayed as record details and are not editable in this form.
3. Select **Save Changes** to save, or **Cancel** to discard edits and return to the saved information.
4. If saved offline, a notice indicates the profile will sync when online.

To remove a registration, select **Remove Child Registration**, then choose **Confirm Remove** to proceed or **Keep Registration** to cancel. Removal cannot be undone. Saved checkups and supplement records are retained. The operation may queue if offline.

MNAO opens the profile from its Masterlist **Profile** button in read-only mode: the assessment tab and edit/remove controls are not available. Profile details, checkup history, and supplement history can still be viewed.

### 6.2 Monthly Assessment

This tab is available to BNS. It shows whether the child is pending or already checked for the current assessment period.

1. If the child is pending, enter **Weight (kg)** and **Height (cm)**. Use decimal values where appropriate.
2. Review **Computed Nutritional Status**. The application calculates the WFA (weight-for-age), HFA (height-for-age), and WFL/H (weight-for-length/height) statuses from the child's profile and measurements. When offline, it may compute the preview on the device.
3. Select **Save Monthly Assessment**.
4. Read any validation or save message. If saved offline, the assessment is queued to sync.

Only one assessment per child is allowed per period. If already assessed, the tab shows **Checked** and explains when the next assessment period begins. Use Checkup History to review the saved measurement.

### 6.3 Checkup History

The history table lists prior measurement dates, weight/height, and WFA, HFA, and WFL/H status badges. If no assessments exist, it displays **No history available**. If loading fails, select **Retry** in the warning banner.

### 6.4 Vitamins & Deworming

This tab contains the same schedule and dose controls described in [Vitamins & Deworming](#42-vitamins--deworming), scoped to this child. BNS users can mark eligible doses; MNAO profiles are read-only.

## 7. MNAO workspace

### 7.1 Health Trends

Health Trends provides a year-wide line chart and a month-specific comparison of nutritional issues by barangay.

#### Assessment-period trend

1. Choose an **Indicator**: Weight-for-Age (WFA), Height-for-Age (HFA), or Weight-for-Height/Length (WFL/H).
2. Choose a **Barangay** or **All barangays**.
3. Use the status buttons beneath the filters to show or hide individual status lines in the chart. Each button toggles its status on or off; choosing another indicator resets the visible statuses to that indicator's available set.
4. Hover a chart point to see its period, status, and case count.
5. Select **Refresh** to reload the trend.

The trend covers January–December of the current year. January–March appears as one Jan–Mar point because the system treats that span as a shared assessment period. The callout above the chart reports the current period's total for the selected indicator.

#### Nutritional Issues by Barangay

1. Choose a **Month**.
2. Review the bar chart showing unique children with at least one non-normal WFA, HFA, or WFL/H result in that month.
3. Hover a bar for the barangay's total and indicator/status breakdown.
4. Use **Previous** and **Next** to move through barangay pages.
5. Select **Refresh** to reload the comparison.

A child with more than one non-normal indicator is counted once in the bar's overall issue count. The tooltip shows the separate indicator breakdown where available.

### 7.2 Masterlist — All Barangays

This page provides MNAO with monthly assessment rows and summaries from all barangays. Summary tiles include total registered, total assessed, normal status, at-risk/malnourished, overweight/obese, severe cases, and new registrations.

1. Choose a **Month**.
2. Optionally enter a child's name in **Search**.
3. Select a **Barangay** or **All barangays**.
4. Select **Purok / Sitio**. This filter becomes available after choosing a barangay.
5. Choose a **Nutrition Status**.
6. Select **Clear filters** to reset search and filters.
7. Use **Previous** and **Next** to page through the matching rows.
8. Select **Refresh** to reload the summary and rows.

Rows show location, caregiver and child names, IP group, sex, birth and measurement dates, weight, height, age, and the three nutrition status indicators. Select **Profile** on a row to open the child's profile in read-only mode.

Select **Print** to prepare and print all rows matching the current month and filters, not only the rows visible on the current screen page. The print sheet includes the applied filters, current measurement columns, and blank follow-up columns for the next measurement round. If preparation fails, select **Retry** in the print warning.

### 7.3 Reports

The **Consolidated Reports** page presents an OPT+-style Growth Summary Report for a selected month.

1. Choose a **Month**.
2. Choose a specific **Barangay** or **All barangays**.
3. Review the summary by age bracket and sex for WFA, HFA, and WFL/H statuses.
4. Use **Refresh** to request the latest report.
5. Select **Print** to open the browser's print dialog.

The report includes the total registered and assessed figures and status totals/percentages. It is a summary page; it does not provide row-by-row editing controls.

### 7.4 Barangay Map

The map displays barangay locations with marker colors representing public-health significance. The map and side panel update to the selected month and indicator.

1. Choose an **Indicator**: **Overall significance**, **Underweight**, **Stunted**, **Wasted**, or **Overweight**.
2. Choose a **Month**.
3. Read the legend for severity levels: Very Low, Low, Medium, High, Very High, or No data.
4. Pan or zoom the map, then select a barangay marker. The marker tooltip identifies the barangay; its popup shows registered-child count and severity or indicator prevalence.
5. The side panel shows registered and assessed child totals, prevalence percentages for underweight, stunting, wasting, and overweight, and the nutritional-status breakdown for WFA, HFA, and WFL/H.
6. Select **Refresh** to reload the barangay and health data.
7. Select **Print** to print the map and its current month/indicator context. The app prepares the map layout before opening the browser print dialog.

For a barangay with High or Very High overall significance, select **Explain with AI** to request an explanation of the displayed prevalence data. While the request runs, the panel shows **Analyzing…**. If it fails, select **Try again**. The AI explanation supplements the reported data and should not replace professional nutrition or health judgment.

## 8. Common terms

- **BNS:** Barangay Nutrition Scholar.
- **MNAO:** Municipal Nutrition Action Officer.
- **Purok / Sitio:** A smaller community or neighborhood within a barangay.
- **WFA:** Weight-for-Age.
- **HFA:** Height-for-Age.
- **WFL/H:** Weight-for-Length/Height.
- **Assessment period:** The reporting window used to limit assessments. January–March is treated as one period; other displayed months are assessed as monthly periods.
- **Queued / saved on this device:** The action is stored locally and has not yet been confirmed as synchronized to the server.

## 9. Privacy and good practice

WeighToGo contains children's personal details and sensitive health information. Use only your authorized account, keep your credentials private, do not share screenshots or printed reports with unauthorized people, and sign out when finished on a shared device. Follow municipal procedures when correcting records or handling a parent's/guardian's request about a child's information.
