# Best and Fast (بيست آند فاست) - Garage POS

Invoicing / point of sale for a garage in Samail: accident repair, vehicle painting, mechanical repair and
used spare parts. Plain HTML + CSS + JavaScript on the front, one small PHP file on the back (`api/index.php`),
SQLite database outside the website folder. No Firebase, no MySQL, nothing to install.

Arabic (default) and English, right-to-left. Built for a PC; the phone view is for checking numbers.

```
index.html          the app
bill.html           the page a customer opens from the WhatsApp link (one bill, read-only, printable)
css/  js/  img/     styles, scripts, logo
js/subscription.js  the subscription dates shown in Settings (edit once a year)
api/index.php       the server (login, saving, invoice numbers, share links)
api/features.php    switches only the system provider changes (workers on / worker limit)
data/               fallback place for the database - never uploaded to GitHub
.htaccess           Hostinger settings (compression, caching, security headers)
```

## What the garage gets

- **Bill for a job on a car**: customer, plate, car, colour, mileage, expected delivery, fault, then the services
  and parts. Stages: *Received -> In repair -> Ready for pickup -> Delivered* (click the stage in the list to move it on).
- **Bill for a sale of used spare parts**: no car details, saved as delivered.
- Payments and part payments, credit customers, statement of account, discount, Excel export, reports
  (by section, by day, by customer, by worker, by stage).
- **Send the bill on WhatsApp** (see below). Print on A4 (bilingual) or an 80 mm receipt.
- **Workers**: the owner can add up to **5** workers (see *Accounts*).

The system starts with **example data** (5 customers, 10 bills, example prices). Every example is marked, and the
owner removes exactly those with one button (*Remove example data*, shown on a notice at the top). Real work is never
touched. If nothing real was billed yet, the numbering starts again from INV-00001.

## Sending a bill on WhatsApp

Button on the new-bill screen (*Save & send on WhatsApp*), on every row of the Invoices list, and inside every bill.
A window opens with the customer's number (filled from the bill, editable) and the message already written
(Arabic or English, editable). *Open WhatsApp* opens WhatsApp (the computer app or WhatsApp Web) on that chat; the owner
presses Send. The message goes out from **the WhatsApp account signed in on that device** - the shop's own number
(97230444 is printed in the message as the contact number).

- Oman numbers: 8 digits. Other countries: start with `+` and the country code. Empty = choose the person inside WhatsApp.
- On the real website the message also carries a **private link** to the full printed bill (`bill.html?t=<32 random characters>`).
  Only someone who has the link can open it; it shows that one bill, read-only, with a print / save-as-PDF button.
  The link is made the first time a bill is sent and never changes, so links already sent keep working.
  On `localhost` the link is left out (nobody else can reach it).
- Nothing is sent automatically by the server. (Sending without opening WhatsApp would need the paid WhatsApp Business API.)

## Put it live on Hostinger

1. Push this folder to GitHub (the `.gitignore` already keeps `data/`, `_for-customer/` and secrets out).
2. hPanel -> **Websites -> Git** -> connect the repo, branch `main`, install path `public_html`.
3. hPanel -> **Advanced -> PHP Configuration**: choose **PHP 8.1 or newer** and make sure `pdo_sqlite` is ticked.
4. Open the site. The first screen creates the accounts - **it appears only once**, so open it yourself first:
   - **Owner account (the customer)**: full control. The customer's username and password.
   - **Support account - view only (you)**: sees every screen, can never change any data (the server refuses every change).
   Passwords are 8+ characters and are stored encrypted. They are never written in the code.
5. **Check the storage** - sign in, open **Settings -> Where your data is stored**. It must say
   *"Safe folder outside the website"*, *Can save: yes*, and show the database size.
6. Once the SSL certificate shows Active (hPanel -> Security -> SSL), open `.htaccess` and
   remove the `#` in front of the three HTTPS-redirect lines. (The WhatsApp link works over http too, but https is better.)
7. Sign in as the owner -> **Settings**: check the garage details and print size; **Price List**: enter the real prices.
8. Send one test bill to your own number from WhatsApp, open the link on your phone, then press **Remove example data**.

If the page shows **"Cannot reach the server program"**: PHP is not running the `api` folder. Check step 3 (PHP 8.1+,
`pdo_sqlite` ticked) and that the `api` folder was deployed. Nothing is ever saved in that state, and nothing is lost.
If the site shows a 500 error, delete the line `Options -Indexes` in `.htaccess`.

## Where the data lives (why it survives updates and a change of domain)

The database is **not** in the website folder. It is kept in the hosting account's home folder:

```
/home/uXXXXXXXXX/bestandfast-pos-data/
    bestandfast-pos.sqlite     the live database (accounts, bills, customers, prices, settings, share links)
    backups/                   one automatic copy per day, the last 30 days are kept
    sessions/                  sign-in sessions
```

That folder is outside `public_html`, so it can never be downloaded from the internet, and re-deploying from GitHub,
deleting `public_html`, reconnecting the repository or moving the site to the purchased domain **cannot touch it**.

- **Restore a server backup**: File Manager -> `bestandfast-pos-data` -> copy a file from `backups/` over `bestandfast-pos.sqlite`.
- The owner's own copy: *Settings -> Download backup*, and Hostinger's own weekly backups.
- To choose another place: create `api/config.local.php` on the server containing
  `<?php return ['data_dir' => '/full/path/folder'];` (it is not in Git).

## Accounts

| Account | Can do |
|---|---|
| **Owner (admin)** | everything: bills, payments, customers, prices, reports, settings, workers, backup |
| **Worker (up to 5)** | make bills, receive payments, move a car to its next stage, manage customers, send on WhatsApp (no reports, prices, settings, void or delete) |
| **View only (support - you)** | look at every screen, print, export and open WhatsApp - **change nothing** |

The limit of 5 workers is enforced by the **server** (not just the screen); two people adding at the same moment cannot
get past it. The owner can delete a worker at any time (the worker is signed out at once, his bills stay) and then add
another. The owner and the support account do not count in the 5. A worker can never be created as an owner: the owner
and the support account exist only from the first-run screen. The support account cannot be deleted or reset by the customer.

Change the limit, or switch workers off, in `api/features.php` (`'max_staff' => 5`, `'staff_accounts' => true`) and push
to GitHub - only the system provider can do this. Nothing in the customer's data changes.

If the owner's own password is lost there is no reset button: ask the system provider for the one-time recovery tool.
Never delete `bestandfast-pos.sqlite` - that erases everything.

## Subscription timer

*Settings -> Subscription* shows a live countdown to the next yearly payment, with the start and due dates. It is
informational (it never locks the system). To renew next year, edit the two dates in `js/subscription.js` and push to GitHub.
The dates in the file today (12/10/2026 -> 12/10/2027) are a default - change them to the real agreement.

## Day to day

- Invoice numbers (`INV-00001...`) are given by the server and never repeat. A bill can be *voided* (kept, marked VOID) or,
  by the owner, deleted permanently (its number is never reused). Saving a bill is retry-safe: a lost connection or a
  double tap cannot create two bills.
- The server re-adds every bill and refuses one whose figures do not add up, or whose payments are more than the total.
- VAT: the garage is **not** VAT registered, so bills print as a plain "Invoice" with no VAT. If it registers later, the
  owner switches it on in *Settings* (VAT number + %), and bills print as tax invoices.
- **Back up**: *Settings -> Download backup* regularly. The server also keeps 30 daily copies.

## Updating

Change files, run `node tools/stamp-version.js` (gives every css / js file a new version stamp so Hostinger's CDN never serves
an old one), then `git push`. The database and logins are untouched because they are not in Git.

The automated test suites are kept **outside** this folder (`../2 customer-tests`) so they never reach GitHub or the live site.
