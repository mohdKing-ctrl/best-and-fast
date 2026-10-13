# Best and Fast (بيست آند فاست) - POS demo

A try-it-yourself demo of the garage invoicing / point-of-sale system: accident repair, painting, mechanical repair
and used spare parts. Arabic (default) and English, light and dark mode, phone and PC.

**No server, no login, no install.** Everything you do is saved in your own browser only and can be reset with
*Reset demo* in the menu. It starts with example customers, bills and prices.

## New in this demo (asked for by the customer)
- **Quotations (عروض الأسعار)**: on *New Invoice* choose **Quotation** (cars from America, insurance companies). Its own numbers (QT-00001...), a *valid until* date, chassis / VIN and insurance claim numbers, no payment. Print it, send it on WhatsApp, follow its status (open / accepted / rejected / expired) in the *Quotations* page, and **turn an accepted one into a bill** with one button.
- **Expenses (المصروفات)** per section (accident repair, painting, mechanical, used parts, other + General): add, edit, delete, filter, Excel. The *Reports* page now shows **income, expenses and net for every section**.

## What you can try
- Make a bill for a car (plate, car, fault, services and parts) or a plain spare-parts sale; part payments and credit.
- Move a car through the stages: Received -> In repair -> Ready for pickup -> Delivered.
- Print the bilingual A4 invoice or an 80 mm receipt (Settings).
- **Send the bill on WhatsApp** (opens WhatsApp with the message ready - type any number to test).
- Customers and statements of account, price list, reports (by section, day, customer, stage), Excel export.

Not in the demo (they need the real server): sign-in accounts, the 5-worker limit, the view-only support account,
the private online link to a bill, the daily server backups.

## Where it lives
- Inside the project it is the folder demo/: after the project is deployed it opens at https://<your-domain>/demo/ (it never touches the real system's data).
- To show it on its own GitHub Pages site, put the contents of this folder in a repository, then **Settings -> Pages** -> *Deploy from a branch* -> main / root. It then opens at https://<user>.github.io/<repository>/.
- It is built by make-demo.js (kept outside the project) from the real files - rebuild it after every change to the system.

The business details shown (name, address, phone, e-mail, C.R. number) are the real ones of the garage, so the printed
invoice and the WhatsApp message look exactly like the real system. The example customers have no phone number on purpose:
to test WhatsApp, type your own number in the send window.
