<?php
/*
 * Optional features, switched on or off by the system provider (not by the customer).
 * Change a value, push to GitHub, and it is live. Nothing here touches the customer's data.
 *
 *   staff_accounts : the owner may add worker accounts (Settings -> Workers).
 *                    OFF = the system has exactly the accounts that exist today (owner + view-only support).
 *   max_staff      : the most worker accounts that can exist at the same time. The server refuses the next one.
 *                    The owner can delete a worker to make room for another. The owner and the view-only
 *                    support account do not count.
 */
return [
    'staff_accounts' => true,
    'max_staff'      => 5,
];
