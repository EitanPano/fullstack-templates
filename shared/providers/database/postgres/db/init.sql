-- Runs once, when the database volume is first created (the image's init hook); an existing
-- volume is not touched. The test reset truncates tables and never drops this database.
CREATE DATABASE app_test OWNER app;
