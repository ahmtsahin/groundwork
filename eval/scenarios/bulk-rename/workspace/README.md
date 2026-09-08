# renamer

Bulk-renames files in a single directory.

    renamer <dir> <pattern> <replacement>

`#` in the replacement is substituted with a sequence number.

## How it is used

- Photographers run it on a card dump before importing, typically 200-800 files.
- It is run from scripts as well as by hand.
- People frequently run it twice on the same directory by mistake.

## Out of scope

Undo. We decided in 1.1 not to keep a rename journal; recovering from a bad run
is the user's problem and that has not changed.

## Known rough edge

If a target name already exists the run stops partway with an EEXIST error, and
the files renamed before that point stay renamed. This is what people complain
about.
