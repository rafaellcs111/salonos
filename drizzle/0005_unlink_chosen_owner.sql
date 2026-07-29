UPDATE `tenants`
SET `owner_email` = NULL
WHERE `id` = 'chosen'
  AND lower(`owner_email`) = 'rafaelviamaquinas@gmail.com';
