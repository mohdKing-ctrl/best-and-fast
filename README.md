# Best and Fast (بيست آند فاست) - POS demo

A try-it-yourself demo of the garage invoicing / point-of-sale system: accident repair, painting, mechanical repair
and used spare parts. Arabic (default) and English, light and dark mode, phone and PC.

**No server, no login, no install.** Everything you do is saved in your own browser only and can be reset with
*Reset demo* in the menu. It starts with example customers, bills and prices.

## What you can try
- Make a bill for a car (plate, car, chassis no., fault, services and parts) or a plain spare-parts sale; part payments and credit.
- **Quotations (عروض الأسعار)** for customers, cars imported from America and insurance companies: own numbers (QT-00001...), a *valid until* date, insurance claim no., status (open / accepted / rejected / expired), and **turn an accepted quotation into a bill** with one button.
- **Payment reminders (تذكيرات الدفع)**: when a customer pays later, choose the day to remind him (after 2, 3 days ...). On that day a pop-up shows his name and what he owes, with a button that opens WhatsApp with a polite reminder already written.
- **Expenses (المصروفات)** per section (accident repair, painting, mechanical, used parts, other + General), and the *Reports* page shows income, expenses and net for every section.
- **Send the bill as an A4 PDF** (the **PDF** button beside every bill, or the green button of the WhatsApp window; the demo saves the PDF and opens WhatsApp on the chat), invoice **notes printed in red**, **personal reminders** (your own notes with a day and time), print sizes **A4 / A5 / 80 mm / 58 mm** with a scale, and the **name in the commercial register**.
- Move a car through the stages: Received -> In repair -> Ready for pickup -> Delivered.
- Print the bilingual A4 invoice or an 80 mm receipt (Settings).
- **Send the bill on WhatsApp** (opens WhatsApp with the message ready - type any number to test).
- Customers and statements of account, price list, reports (by section, day, customer, stage, worker), Excel export.

Not in the demo (they need the real server): sign-in accounts, the 5-worker limit, the view-only support account,
the private online link to a bill, the daily server backups.

## Where it lives
- Inside the project it is the folder demo/: after the project is deployed it opens at https://<your-domain>/demo/ (it never touches the real system's data).
- To show it on its own GitHub Pages site, put the contents of this folder in a repository, then **Settings -> Pages** -> *Deploy from a branch* -> main / root. It then opens at https://<user>.github.io/<repository>/.
- It is built by make-demo.js (kept outside the project) from the real files - rebuild it after every change to the system.

The business details shown (name, address, phone, e-mail, C.R. number) are the real ones of the garage, so the printed
invoice and the WhatsApp message look exactly like the real system. The example customers have no phone number on purpose:
to test WhatsApp, type your own number in the send window.
