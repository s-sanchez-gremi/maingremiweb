-- Moving a response to another lane of the board (Forms v2) changes a choice answer on behalf of staff. The first version is kept in original_answers
-- (the same place a respondent's edit keeps it); this records that and when staff changed it. Additive: nothing happens until someone moves a card.
alter table submissions add column staff_edited_at timestamptz;
