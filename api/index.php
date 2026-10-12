<?php
/*
 * Best and Fast POS - server API
 * ---------------------------------------------------------------
 * One small file. Stores everything in a SQLite database (no MySQL setup needed).
 * Needs PHP 8.1+ with pdo_sqlite (Hostinger has both).
 *
 * WHERE THE DATA LIVES - it must survive a redeploy from GitHub and a change of domain, so by default
 * the database is kept in  <hosting account home>/bestandfast-pos-data/  : outside every website folder,
 * never served on the web, never touched by Git. If that is not possible it falls back to ../data
 * (protected by .htaccess and kept out of Git). An existing ../data/bestandfast-pos.sqlite is always kept.
 * Override: environment variable BF_DATA_DIR, or api/config.local.php returning ['data_dir' => '/path'].
 *
 * Every request is JSON in / JSON out:   api/?action=NAME
 * Writes are POST and must carry the header  X-Requested-With: bf-pos
 * (browsers refuse to send a custom header from another website, which is
 * what blocks cross-site request forgery).
 *
 * The only action that needs no login is  public_invoice : it hands out ONE invoice to whoever holds its
 * long random link token (the link the garage sends to a customer on WhatsApp). Nothing else is public.
 */
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
date_default_timezone_set('Asia/Muscat');

const COLLECTIONS = ['settings', 'services', 'customers', 'invoices'];
const MAX_BODY    = 12 * 1024 * 1024;      // restore files can be large
const MAX_DOC     = 300 * 1024;            // one invoice / customer / service
const JOBS        = ['received', 'repair', 'ready', 'delivered'];
const KINDS       = ['repair', 'parts'];
const METHODS     = ['cash', 'card', 'transfer', 'cheque'];

/* ---------------------------------------------------------- output */
function out(array $d, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}
function fail(string $error, int $code = 400): never
{
    out(['ok' => false, 'error' => $error], $code);
}

set_exception_handler(function (Throwable $e): void {
    error_log('[bf-pos] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail('server_error', 500);
});

/* ---------------------------------------------------------- where the data lives */
/* Returns [directory, kind]; kind = custom | outside | inside */
function resolve_data_dir(): array
{
    static $r = null;
    if ($r !== null) return $r;
    $inside = __DIR__ . '/../data';

    $env = getenv('BF_DATA_DIR');
    if (is_string($env) && $env !== '') return $r = [rtrim($env, '/\\'), 'custom'];
    $cfgFile = __DIR__ . '/config.local.php';
    if (is_file($cfgFile)) {
        $c = include $cfgFile;
        if (is_array($c) && !empty($c['data_dir'])) return $r = [rtrim((string)$c['data_dir'], '/\\'), 'custom'];
    }
    // An installation that already keeps its database inside the website folder stays there (never split the data).
    if (is_file($inside . '/bestandfast-pos.sqlite')) return $r = [$inside, 'inside'];

    // Preferred: the hosting account's home folder (/home/uXXXX/bestandfast-pos-data). It does not depend on the domain name.
    $doc  = rtrim(str_replace('\\', '/', (string)($_SERVER['DOCUMENT_ROOT'] ?? '')), '/');
    $home = null;
    if (preg_match('#^(.+?)/domains/#', $doc, $m)) $home = $m[1];
    elseif ($doc !== '') $home = dirname($doc);
    if ($home && @is_dir($home) && @is_writable($home)) {
        $dir = $home . '/bestandfast-pos-data';
        if ((@is_dir($dir) || @mkdir($dir, 0750, true)) && @is_writable($dir)) return $r = [$dir, 'outside'];
    }
    return $r = [$inside, 'inside'];
}
function data_dir(): string { return resolve_data_dir()[0]; }
function db_file(): string { return data_dir() . '/bestandfast-pos.sqlite'; }

/* ---------------------------------------------------------- database */
function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    if (!extension_loaded('pdo_sqlite')) fail('sqlite_missing', 500);
    $dir = data_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) fail('data_dir_missing', 500);
    if (!is_writable($dir)) fail('data_dir_not_writable', 500);

    $pdo = new PDO('sqlite:' . db_file(), null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 8000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        pass TEXT NOT NULL,
        created INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS docs (
        col TEXT NOT NULL,
        id TEXT NOT NULL,
        json TEXT NOT NULL,
        updated INTEGER NOT NULL,
        PRIMARY KEY (col, id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS idem (k TEXT PRIMARY KEY, id TEXT NOT NULL, ts INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, id TEXT NOT NULL)');
    return $pdo;
}

/* One consistent copy of the database per day (kept 30 days) next to the live file. */
function daily_backup(): void
{
    try {
        $dir  = data_dir() . '/backups';
        $file = $dir . '/bestandfast-pos-' . date('Y-m-d') . '.sqlite';
        if (is_file($file)) return;
        if (!is_dir($dir)) @mkdir($dir, 0750, true);
        if (!is_dir($dir) || !is_writable($dir)) return;
        try {
            db()->exec("VACUUM INTO '" . str_replace("'", "''", $file) . "'");
        } catch (Throwable $e) {
            @copy(db_file(), $file);
        }
        foreach (glob($dir . '/bestandfast-pos-*.sqlite') ?: [] as $f) {
            if (@filemtime($f) < time() - 30 * 86400) @unlink($f);
        }
    } catch (Throwable $e) {
        error_log('[bf-pos] backup failed: ' . $e->getMessage());
    }
}

function meta_get(string $k, string $default = ''): string
{
    $st = db()->prepare('SELECT v FROM meta WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? $default : (string)$v;
}
function meta_set(string $k, string $v): void
{
    db()->prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$k, $v]);
}

/* ---------------------------------------------------------- session / auth */
function start_session(): void
{
    $sessDir = data_dir() . '/sessions';
    if (!is_dir($sessDir)) @mkdir($sessDir, 0750, true);
    if (is_dir($sessDir) && is_writable($sessDir)) session_save_path($sessDir);

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    ini_set('session.gc_maxlifetime', '43200');           // stay signed in for a 12 h working day
    ini_set('session.use_strict_mode', '1');
    session_name('bf_pos');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/', 'secure' => $https,
        'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_start();
}

function current_user(): ?array
{
    if (empty($_SESSION['uid'])) return null;
    $st = db()->prepare('SELECT id, username, name, role FROM users WHERE id = ?');
    $st->execute([(int)$_SESSION['uid']]);
    $u = $st->fetch();
    return $u ?: null;
}
function require_user(): array
{
    $u = current_user();
    if (!$u) fail('not_logged_in', 401);
    return $u;
}
function require_admin(): array
{
    $u = require_user();
    if ($u['role'] === 'viewer') fail('read_only', 403);
    if ($u['role'] !== 'admin') fail('admin_only', 403);
    return $u;
}
/* Anyone who may create or change business records (owner or worker) - never the view-only account. */
function require_writer(): array
{
    $u = require_user();
    if ($u['role'] === 'viewer') fail('read_only', 403);
    return $u;
}
function user_count(): int
{
    return (int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
}
function login_as(array $u): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
}
function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0'), 0, 64);
}
function public_user(array $u): array
{
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role']];
}

/* ---------------------------------------------------------- helpers */
function check_doc(mixed $doc, string $col): array
{
    if (!is_array($doc)) fail('bad_doc');
    if (strlen(json_encode($doc, JSON_UNESCAPED_UNICODE)) > MAX_DOC) fail('doc_too_large', 413);
    if ($col !== 'settings') {
        $id = (string)($doc['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail('bad_id');
        $doc['id'] = $id;
    }
    return $doc;
}
function save_doc(string $col, string $id, array $doc): void
{
    db()->prepare('INSERT INTO docs (col, id, json, updated) VALUES (?, ?, ?, ?)
                   ON CONFLICT(col, id) DO UPDATE SET json = excluded.json, updated = excluded.updated')
        ->execute([$col, $id, json_encode($doc, JSON_UNESCAPED_UNICODE), time()]);
}
function get_doc(string $col, string $id): ?array
{
    $st = db()->prepare('SELECT json FROM docs WHERE col = ? AND id = ?');
    $st->execute([$col, $id]);
    $j = $st->fetchColumn();
    return $j === false ? null : json_decode((string)$j, true);
}
function col_name(mixed $c): string
{
    $c = (string)$c;
    if (!in_array($c, COLLECTIONS, true)) fail('bad_collection');
    return $c;
}
function can_write(string $col, array $user): bool
{
    if ($user['role'] === 'viewer') return false;               // view-only: never
    if ($user['role'] === 'admin') return true;
    return in_array($col, ['customers', 'invoices'], true);   // workers: customers + invoices only
}
function pad_number(int $n, string $prefix): string
{
    return $prefix . '-' . str_pad((string)$n, 5, '0', STR_PAD_LEFT);
}
function invoice_prefix(): string
{
    $s = get_doc('settings', 'main');
    $p = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($s['prefix'] ?? 'INV')));
    return $p !== '' ? substr($p, 0, 8) : 'INV';
}
function check_password(string $p): void
{
    if (strlen($p) < 8) fail('password_short');
    if (strlen($p) > 200) fail('password_long');
}
function r3(float $n): float { return round($n, 3); }
function rollback_fail(PDO $pdo, string $error, int $code = 400): never
{
    try { $pdo->exec('ROLLBACK'); } catch (Throwable $e) { /* nothing open */ }
    fail($error, $code);
}

/* Optional features (api/features.php). Only the system provider can change them. */
function features_all(): array
{
    static $f = null;
    if ($f === null) {
        $f = ['staff_accounts' => false, 'max_staff' => 0];
        $file = __DIR__ . '/features.php';
        if (is_file($file)) {
            $c = include $file;
            if (is_array($c)) foreach ($c as $k => $v) $f[(string)$k] = $v;
        }
    }
    return $f;
}
function feature(string $name): bool { return !empty(features_all()[$name]); }
function feature_num(string $name): int { return max(0, (int)(features_all()[$name] ?? 0)); }
function require_feature(string $name): void
{
    if (!feature($name)) fail('feature_off', 403);
}

/* The server re-adds every bill itself and refuses one whose figures do not add up
   (a bug or a tampered browser can never put a wrong total into the books). Mirrors Calc.totals in js/core.js. */
function check_invoice(array &$doc, bool $isNew): void
{
    $items = $doc['items'] ?? null;
    if (!is_array($items) || count($items) < 1 || count($items) > 200) fail('bad_doc');
    $office = 0.0; $behalf = 0.0;
    foreach ($items as $it) {
        if (!is_array($it)) fail('bad_doc');
        if (!is_numeric($it['price'] ?? null) || !is_numeric($it['q'] ?? null)) fail('bad_doc');
        $price = (float)$it['price']; $q = (float)$it['q'];
        if ($price < 0 || $q <= 0 || $price > 1e7 || $q > 1e6) fail('bad_doc');
        $line = r3($price * $q);
        if (!empty($it['ob'])) $behalf += $line; else $office += $line;
    }
    $office = r3($office); $behalf = r3($behalf);
    $disc = is_numeric($doc['discount'] ?? 0) ? (float)($doc['discount'] ?? 0) : 0.0;
    $disc = r3(min(max($disc, 0.0), $office));
    $pct  = is_numeric($doc['vatPct'] ?? 0) ? (float)($doc['vatPct'] ?? 0) : 0.0;
    if ($pct < 0 || $pct > 100) fail('bad_doc');
    $base  = r3($office - $disc);
    $vat   = r3($base * $pct / 100);
    $total = r3($base + $vat + $behalf);
    foreach (['office' => $office, 'behalf' => $behalf, 'discount' => $disc, 'vat' => $vat, 'total' => $total] as $k => $v) {
        if (!is_numeric($doc[$k] ?? null) || abs((float)$doc[$k] - $v) > 0.002) fail('bad_totals');
    }
    $pays = $doc['payments'] ?? [];
    if (!is_array($pays) || count($pays) > 200) fail('bad_doc');
    $paid = 0.0;
    foreach ($pays as $p) {
        if (!is_array($p) || !is_numeric($p['amount'] ?? null) || (float)$p['amount'] <= 0) fail('bad_doc');
        if (!in_array((string)($p['method'] ?? ''), METHODS, true)) fail('bad_doc');
        $paid += (float)$p['amount'];
    }
    if ($paid > $total + 0.002) fail('overpaid');
    if (!in_array((string)($doc['job'] ?? ''), JOBS, true)) fail('bad_doc');
    if (!in_array((string)($doc['kind'] ?? ''), KINDS, true)) fail('bad_doc');
    if (!empty($doc['void']) && $isNew) fail('bad_doc');
}

$action = (string)($_GET['action'] ?? '');

/* ---------------------------------------------------------- the one public action: a shared invoice */
if ($action === 'public_invoice') {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') fail('bad_request', 405);
    $tok = (string)($_GET['t'] ?? '');
    if (!preg_match('/^[a-f0-9]{32}$/', $tok)) fail('not_found', 404);
    $st = db()->prepare('SELECT id FROM shares WHERE token = ?');
    $st->execute([$tok]);
    $id = $st->fetchColumn();
    $doc = $id === false ? null : get_doc('invoices', (string)$id);
    // the token stored inside the bill must match too (a restored backup can reuse an id for another bill)
    if (!$doc || !hash_equals((string)($doc['shareToken'] ?? ''), $tok)) fail('not_found', 404);
    $keep = ['number', 'date', 'time', 'customerName', 'customerPhone', 'customerVat', 'customerAddr', 'company', 'kind',
             'plate', 'car', 'color', 'km', 'due', 'fault', 'discount', 'vatPct', 'vat', 'office', 'behalf', 'total',
             'job', 'note', 'void', 'createdBy', 'cr', 'vatNo'];
    $inv = [];
    foreach ($keep as $k) if (array_key_exists($k, $doc)) $inv[$k] = $doc[$k];
    $inv['items'] = [];
    foreach ((array)($doc['items'] ?? []) as $it) {
        $inv['items'][] = ['n' => $it['n'] ?? '', 'a' => $it['a'] ?? '', 'unit' => $it['unit'] ?? '', 'cat' => $it['cat'] ?? '',
                           'ob' => !empty($it['ob']), 'price' => $it['price'] ?? 0, 'q' => $it['q'] ?? 0];
    }
    $inv['payments'] = [];
    foreach ((array)($doc['payments'] ?? []) as $p) {
        $inv['payments'][] = ['date' => $p['date'] ?? '', 'amount' => $p['amount'] ?? 0, 'method' => $p['method'] ?? 'cash'];
    }
    $s = get_doc('settings', 'main') ?: [];
    $set = [];
    foreach (['name', 'nameAr', 'addr', 'addrAr', 'phone', 'email', 'cr', 'vatNo', 'footer', 'terms', 'bank', 'customCats', 'customUnits'] as $k) {
        if (array_key_exists($k, $s)) $set[$k] = $s[$k];
    }
    out(['ok' => true, 'invoice' => $inv, 'settings' => $set]);
}

/* ---------------------------------------------------------- request */
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$body   = [];

if ($isPost) {
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'bf-pos') fail('bad_request', 403);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY) fail('too_large', 413);
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
    if ($raw !== '' && $raw !== false) {
        $body = json_decode($raw, true);
        if (!is_array($body)) fail('bad_json');
    }
}

start_session();

/* ---------------------------------------------------------- actions */
switch ($action) {

    /* ---- who am I / is this a brand-new install --------------- */
    case 'status': {
        $u = current_user();
        out(['ok' => true, 'setup_needed' => user_count() === 0, 'user' => $u ? public_user($u) : null]);
    }

    /* ---- first run: create the owner account ------------------ */
    case 'setup': {
        if (!$isPost) fail('post_only', 405);
        if (user_count() > 0) fail('already_setup', 403);
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $name     = trim((string)($body['name'] ?? ''));
        $pass     = (string)($body['password'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) fail('bad_username');
        if ($name === '') $name = $username;
        check_password($pass);
        // optional second account: view-only (for the system provider's support)
        $v = is_array($body['viewer'] ?? null) ? $body['viewer'] : null;
        $vUser = $vPass = $vName = '';
        if ($v !== null && trim((string)($v['username'] ?? '')) !== '') {
            $vUser = strtolower(trim((string)$v['username']));
            $vPass = (string)($v['password'] ?? '');
            $vName = trim((string)($v['name'] ?? ''));
            if (!preg_match('/^[a-z0-9._-]{3,32}$/', $vUser)) fail('bad_username');
            if ($vUser === $username) fail('username_taken', 409);
            check_password($vPass);
        }
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            // two people opening the first-run page at the same moment: only the first one wins
            if (user_count() > 0) rollback_fail($pdo, 'already_setup', 403);
            $ins = $pdo->prepare('INSERT INTO users (username, name, role, pass, created) VALUES (?, ?, ?, ?, ?)');
            $ins->execute([$username, mb_substr($name, 0, 80), 'admin', password_hash($pass, PASSWORD_DEFAULT), time()]);
            $ownerId = (int)$pdo->lastInsertId();
            if ($vUser !== '') $ins->execute([$vUser, mb_substr($vName !== '' ? $vName : 'Support', 0, 80), 'viewer', password_hash($vPass, PASSWORD_DEFAULT), time()]);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ } throw $e; }
        $u = ['id' => $ownerId, 'username' => $username, 'name' => $name, 'role' => 'admin'];
        login_as($u);
        out(['ok' => true, 'user' => public_user($u)]);
    }

    case 'login': {
        if (!$isPost) fail('post_only', 405);
        $ip = client_ip();
        db()->prepare('DELETE FROM attempts WHERE ts < ?')->execute([time() - 900]);
        $st = db()->prepare('SELECT COUNT(*) FROM attempts WHERE ip = ?');
        $st->execute([$ip]);
        if ((int)$st->fetchColumn() >= 8) fail('too_many_attempts', 429);

        $username = strtolower(trim((string)($body['username'] ?? '')));
        $pass     = (string)($body['password'] ?? '');
        $st = db()->prepare('SELECT * FROM users WHERE username = ?');
        $st->execute([$username]);
        $u = $st->fetch();
        // Always run a hash check so a wrong username takes as long as a wrong password.
        $hash = $u ? $u['pass'] : '$2y$10$usesomesillystringforsaltuOpXu0m3FZ0e1hFZ4c3dG8hS8pWb6';
        $good = password_verify($pass, $hash) && $u;
        if (!$good) {
            db()->prepare('INSERT INTO attempts (ip, ts) VALUES (?, ?)')->execute([$ip, time()]);
            fail('bad_login', 401);
        }
        db()->prepare('DELETE FROM attempts WHERE ip = ?')->execute([$ip]);
        if (password_needs_rehash($u['pass'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE users SET pass = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
        }
        login_as($u);
        out(['ok' => true, 'user' => public_user($u)]);
    }

    case 'logout': {
        if (!$isPost) fail('post_only', 405);
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);
    }

    /* ---- everything the app needs at start-up ----------------- */
    case 'load': {
        $user = require_user();
        daily_backup();
        $res = ['ok' => true, 'user' => public_user($user), 'settings' => null,
                'services' => [], 'customers' => [], 'invoices' => [], 'counter' => (int)meta_get('counter', '0'),
                'features' => ['staff_accounts' => feature('staff_accounts'), 'max_staff' => feature_num('max_staff')]];
        foreach (db()->query('SELECT col, id, json FROM docs ORDER BY rowid')->fetchAll() as $r) {
            $d = json_decode($r['json'], true);
            if (!is_array($d)) continue;
            if ($r['col'] === 'settings') { if ($r['id'] === 'main') $res['settings'] = $d; }
            elseif (isset($res[$r['col']])) $res[$r['col']][] = $d;
        }
        out($res);
    }

    /* ---- is the storage healthy? (owner and view-only account) --- */
    case 'health': {
        $u = require_user();
        if (!in_array($u['role'], ['admin', 'viewer'], true)) fail('admin_only', 403);
        [$dir, $kind] = resolve_data_dir();
        $backups = glob($dir . '/backups/bestandfast-pos-*.sqlite') ?: [];
        rsort($backups);
        $cnt = db()->query("SELECT COUNT(*) FROM docs WHERE col = 'invoices'")->fetchColumn();
        out(['ok' => true, 'kind' => $kind, 'dir' => $dir, 'writable' => is_writable($dir),
             'db_bytes' => (int)@filesize(db_file()), 'php' => PHP_VERSION,
             'sqlite' => (string)db()->query('SELECT sqlite_version()')->fetchColumn(),
             'backups' => count($backups), 'last_backup' => $backups ? substr(basename($backups[0]), 16, 10) : null,
             'invoices' => (int)$cnt, 'time' => date('Y-m-d H:i:s')]);
    }

    /* ---- create / update one record ---------------------------- */
    case 'put': {
        if (!$isPost) fail('post_only', 405);
        $user = require_writer();
        $col  = col_name($body['col'] ?? '');
        if (!can_write($col, $user)) fail('admin_only', 403);
        $doc = check_doc($body['doc'] ?? null, $col);
        $id  = $col === 'settings' ? 'main' : $doc['id'];

        if ($col === 'invoices') {
            // Invoices are only ever created by create_invoice; here we update.
            // The number, id, creation info and share link can never be changed by the browser.
            $old = get_doc('invoices', $id);
            if (!$old) fail('not_found', 404);
            foreach (['id', 'no', 'number', 'created', 'createdBy', 'shareToken', 'demo'] as $k) {
                if (array_key_exists($k, $old)) $doc[$k] = $old[$k]; else unset($doc[$k]);
            }
            $oldPay = is_array($old['payments'] ?? null) ? $old['payments'] : [];
            $newPay = is_array($doc['payments'] ?? null) ? $doc['payments'] : [];
            if ($user['role'] !== 'admin') {
                // A worker may only add payments and move the job stage - never change amounts,
                // items, customer, or void a bill.
                if (!empty($old['void']) || array_slice($newPay, 0, count($oldPay)) != $oldPay) fail('admin_only', 403);
                foreach (array_slice($newPay, count($oldPay)) as $p) {
                    if (!is_array($p) || !is_numeric($p['amount'] ?? null) || (float)$p['amount'] <= 0) fail('bad_doc');
                }
                $job = (string)($doc['job'] ?? '');
                $merged = $old;
                $merged['payments'] = $newPay;
                $merged['job'] = in_array($job, JOBS, true) ? $job : ($old['job'] ?? 'received');
                $doc = $merged;
            }
            check_invoice($doc, false);
        } elseif ($col === 'customers') {
            // the "example" mark can be removed only by the Remove-example-data action, never faked on a real customer
            $old = get_doc('customers', $id);
            if ($old && !empty($old['demo'])) $doc['demo'] = true; else unset($doc['demo']);
        }
        save_doc($col, $id, $doc);
        out(['ok' => true, 'doc' => $doc]);
    }

    /* ---- new invoice: the server hands out the next number ----- */
    case 'create_invoice': {
        if (!$isPost) fail('post_only', 405);
        $user = require_writer();
        $doc = $body['doc'] ?? null;
        if (!is_array($doc) || !is_array($doc['items'] ?? null) || count($doc['items']) < 1) fail('bad_doc');
        if (strlen(json_encode($doc, JSON_UNESCAPED_UNICODE)) > MAX_DOC) fail('doc_too_large', 413);
        unset($doc['demo'], $doc['shareToken'], $doc['voidedAt']);
        $doc['void'] = false;
        check_invoice($doc, true);

        // A retry of the same save (slow connection, double tap) carries the same key: hand back the bill that
        // was already created instead of making a second one with a new number.
        $key = isset($doc['clientKey']) && is_string($doc['clientKey']) && preg_match('/^[A-Za-z0-9_-]{8,80}$/', $doc['clientKey']) ? $doc['clientKey'] : null;
        unset($doc['clientKey']);

        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            if ($key !== null) {
                $st = $pdo->prepare('SELECT id FROM idem WHERE k = ?');
                $st->execute([$key]);
                $prev = $st->fetchColumn();
                if ($prev !== false) {
                    $old = get_doc('invoices', (string)$prev);
                    if ($old) { $pdo->exec('COMMIT'); out(['ok' => true, 'doc' => $old, 'counter' => (int)meta_get('counter', '0'), 'duplicate' => true]); }
                }
            }
            $n = (int)meta_get('counter', '0') + 1;
            meta_set('counter', (string)$n);
            $doc['no']        = $n;
            $doc['id']        = (string)$n;
            $doc['number']    = pad_number($n, invoice_prefix());
            $doc['created']   = time();
            $doc['createdBy'] = $user['name'];
            save_doc('invoices', $doc['id'], $doc);
            if ($key !== null) {
                $pdo->prepare('INSERT INTO idem (k, id, ts) VALUES (?, ?, ?)')->execute([$key, $doc['id'], time()]);
                $pdo->prepare('DELETE FROM idem WHERE ts < ?')->execute([time() - 86400 * 14]);
            }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ }
            throw $e;
        }
        out(['ok' => true, 'doc' => $doc, 'counter' => $n]);
    }

    /* ---- the link that is sent to the customer on WhatsApp ------- */
    case 'share_invoice': {
        if (!$isPost) fail('post_only', 405);
        require_writer();
        $id = (string)($body['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail('bad_id');
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $doc = get_doc('invoices', $id);
            if (!$doc) rollback_fail($pdo, 'not_found', 404);
            $tok = (string)($doc['shareToken'] ?? '');
            if (!preg_match('/^[a-f0-9]{32}$/', $tok)) {
                $tok = bin2hex(random_bytes(16));
                $doc['shareToken'] = $tok;
                save_doc('invoices', $id, $doc);
            }
            $pdo->prepare('INSERT OR REPLACE INTO shares (token, id) VALUES (?, ?)')->execute([$tok, $id]);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ }
            throw $e;
        }
        out(['ok' => true, 'token' => $tok]);
    }

    case 'del': {
        if (!$isPost) fail('post_only', 405);
        $user = require_user();
        $col  = col_name($body['col'] ?? '');
        if ($col === 'settings') fail('bad_collection');
        // Workers can add customers but only the owner can delete anything.
        if ($user['role'] === 'viewer') fail('read_only', 403);
        if ($user['role'] !== 'admin') fail('admin_only', 403);
        $id = (string)($body['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail('bad_id');
        db()->prepare('DELETE FROM docs WHERE col = ? AND id = ?')->execute([$col, $id]);
        out(['ok' => true]);
    }

    /* ---- delete several bills at once (owner only) ------------- */
    case 'del_many': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $ids = $body['ids'] ?? null;
        if (!is_array($ids) || count($ids) < 1 || count($ids) > 1000) fail('bad_id');
        foreach ($ids as $id) {
            if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) fail('bad_id');
        }
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $st = $pdo->prepare("DELETE FROM docs WHERE col = 'invoices' AND id = ?");
            foreach ($ids as $id) $st->execute([$id]);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ } throw $e; }
        // The invoice counter is deliberately left alone: a deleted number is never handed out again.
        out(['ok' => true, 'deleted' => count($ids)]);
    }

    /* ---- replace a whole list (used by "restore original prices") - */
    case 'replace': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $col = col_name($body['col'] ?? '');
        if (!in_array($col, ['services', 'customers'], true)) fail('bad_collection');
        $docs = $body['docs'] ?? null;
        if (!is_array($docs)) fail('bad_doc');
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->prepare('DELETE FROM docs WHERE col = ?')->execute([$col]);
            foreach ($docs as $d) { $d = check_doc($d, $col); save_doc($col, $d['id'], $d); }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ } throw $e; }
        out(['ok' => true]);
    }

    /* ---- whole-database restore / first-run example data / wipe -- */
    case 'restore': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $data = $body['data'] ?? null;
        if (!is_array($data) || !is_array($data['invoices'] ?? null)) fail('bad_backup');
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->exec("DELETE FROM docs");
            $pdo->exec("DELETE FROM shares");
            if (is_array($data['settings'] ?? null)) save_doc('settings', 'main', $data['settings']);
            $maxNo = 0;
            $sh = $pdo->prepare('INSERT OR REPLACE INTO shares (token, id) VALUES (?, ?)');
            foreach (['services', 'customers', 'invoices'] as $col) {
                foreach (($data[$col] ?? []) as $d) {
                    $d = check_doc($d, $col);
                    if ($col === 'invoices') {
                        $maxNo = max($maxNo, (int)($d['no'] ?? 0));
                        if (isset($d['shareToken']) && is_string($d['shareToken']) && preg_match('/^[a-f0-9]{32}$/', $d['shareToken'])) $sh->execute([$d['shareToken'], $d['id']]);
                        else unset($d['shareToken']);
                    }
                    save_doc($col, $d['id'], $d);
                }
            }
            meta_set('counter', (string)max((int)($data['counter'] ?? 0), $maxNo));
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ } throw $e; }
        out(['ok' => true]);
    }

    case 'reset': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        db()->exec('DELETE FROM docs');
        db()->exec('DELETE FROM shares');
        if (!empty($body['resetCounter'])) meta_set('counter', '0');
        out(['ok' => true]);
    }

    /* ---- remove the example customers and bills (only those) ---- */
    case 'demo_remove': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $gone = 0; $left = 0;
            $del = $pdo->prepare('DELETE FROM docs WHERE col = ? AND id = ?');
            foreach ($pdo->query("SELECT col, id, json FROM docs WHERE col IN ('customers', 'invoices')")->fetchAll() as $r) {
                $d = json_decode($r['json'], true);
                if (is_array($d) && !empty($d['demo'])) { $del->execute([$r['col'], $r['id']]); $gone++; }
                elseif ($r['col'] === 'invoices') $left++;
            }
            // Nothing real has been billed yet: start the real numbering from 1 (an example number was never a real bill).
            if ($left === 0) meta_set('counter', '0');
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ } throw $e; }
        out(['ok' => true, 'removed' => $gone, 'counter' => (int)meta_get('counter', '0')]);
    }

    /* ---- worker accounts ---------------------------------------- */
    case 'users': {
        $viewer = require_user();
        if (!in_array($viewer['role'], ['admin', 'viewer'], true)) fail('admin_only', 403);
        $rows = db()->query('SELECT id, username, name, role FROM users ORDER BY id')->fetchAll();
        out(['ok' => true, 'users' => array_map('public_user', $rows), 'max_staff' => feature_num('max_staff')]);
    }

    case 'user_add': {
        if (!$isPost) fail('post_only', 405);
        require_admin();
        require_feature('staff_accounts');
        $username = strtolower(trim((string)($body['username'] ?? '')));
        $name     = trim((string)($body['name'] ?? ''));
        $pass     = (string)($body['password'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) fail('bad_username');
        check_password($pass);
        $max = feature_num('max_staff');
        $pdo = db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $n = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'cashier'")->fetchColumn();
            if ($max > 0 && $n >= $max) rollback_fail($pdo, 'staff_limit', 403);       // the 5-worker limit is enforced here, not on the screen
            $st = $pdo->prepare('SELECT 1 FROM users WHERE username = ?');
            $st->execute([$username]);
            if ($st->fetchColumn()) rollback_fail($pdo, 'username_taken', 409);
            // every account the owner adds is a worker; owner and view-only accounts exist only from the first-run screen
            $pdo->prepare('INSERT INTO users (username, name, role, pass, created) VALUES (?, ?, ?, ?, ?)')
                ->execute([$username, mb_substr($name !== '' ? $name : $username, 0, 80), 'cashier', password_hash($pass, PASSWORD_DEFAULT), time()]);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { try { $pdo->exec('ROLLBACK'); } catch (Throwable $x) { /* closed */ } throw $e; }
        out(['ok' => true]);
    }

    case 'user_del': {
        if (!$isPost) fail('post_only', 405);
        $me = require_admin();
        require_feature('staff_accounts');
        $id = (int)($body['id'] ?? 0);
        if ($id === (int)$me['id']) fail('cannot_delete_self');
        $tr = db()->prepare('SELECT role FROM users WHERE id = ?');
        $tr->execute([$id]);
        $role = $tr->fetchColumn();
        if ($role === false) fail('not_found', 404);
        if ($role !== 'cashier') fail('protected_account', 403);   // only workers can be removed: never the owner or the support account
        db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        out(['ok' => true]);
    }

    case 'user_password': {
        if (!$isPost) fail('post_only', 405);
        $me = require_user();
        $pass = (string)($body['password'] ?? '');
        check_password($pass);
        $targetId = (int)($body['id'] ?? $me['id']);
        if ($targetId !== (int)$me['id']) {
            require_admin();                                   // only the owner can reset someone else
            require_feature('staff_accounts');                 // ...and only when worker accounts are enabled
            $tr = db()->prepare('SELECT role FROM users WHERE id = ?');
            $tr->execute([$targetId]);
            $role = $tr->fetchColumn();
            if ($role === false) fail('not_found', 404);
            if ($role !== 'cashier') fail('protected_account', 403);   // ...and never the support account
        } else {
            $st = db()->prepare('SELECT pass FROM users WHERE id = ?');
            $st->execute([$me['id']]);
            if (!password_verify((string)($body['old'] ?? ''), (string)$st->fetchColumn())) fail('bad_login', 401);
        }
        db()->prepare('UPDATE users SET pass = ? WHERE id = ?')->execute([password_hash($pass, PASSWORD_DEFAULT), $targetId]);
        out(['ok' => true]);
    }

    default:
        fail('unknown_action', 404);
}
