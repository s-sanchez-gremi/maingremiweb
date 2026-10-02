-- Media library: the uploaded size of each file (shown in the library). Word, Excel and PowerPoint files are now
-- accepted next to images and PDFs; they need no schema change (mime + key already describe them).

alter table media add column size integer;
