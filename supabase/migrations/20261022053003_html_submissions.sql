-- Small, self-contained HTML files live with their submission, so creation,
-- replacement and deletion are atomic. Feed queries never select html_content.
alter table public.submissions
  add column html_file_name text,
  add column html_content text,
  add constraint submissions_html_file_check check (
    (html_file_name is null and html_content is null)
    or (
      html_file_name is not null and html_content is not null
      and char_length(html_file_name) between 1 and 180
      and html_file_name ~* '\.html?$'
      and octet_length(html_content) between 1 and 2097152
      and char_length(btrim(html_content)) > 0
    )
  );

comment on column public.submissions.html_content is
  'Untrusted UTF-8 HTML. Serve only with CSP sandbox; never inject into application DOM.';
