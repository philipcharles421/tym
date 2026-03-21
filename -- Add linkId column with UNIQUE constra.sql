-- Add linkId column with UNIQUE constraint
ALTER TABLE profiles 
ADD COLUMN linkId VARCHAR(50) UNIQUE;

-- Create an index for faster lookups
CREATE INDEX idx_profiles_linkId ON profiles(linkId);