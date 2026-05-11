# /fix — Bug Fix Workflow

When the user reports a bug or says something isn't working, follow this exact sequence. Do NOT skip steps.

## Step 1: Understand the problem
- Read the user's description carefully
- If the bug is visual, take a screenshot first to see the current state
- Do NOT start editing code yet

## Step 2: Find the right file
- Use Grep/Glob to locate the exact file and code responsible for the bug
- State which file you're going to edit and what you think the problem is
- Wait for confirmation if the fix is non-obvious

## Step 3: Make the minimal fix
- Edit ONLY what's necessary to fix the bug
- Do NOT refactor surrounding code
- Do NOT add extra features
- Do NOT touch files unrelated to the bug

## Step 4: Verify the fix
- TypeScript check will run automatically via the post-edit hook
- If there are type errors, fix them before moving on
- If this is a visual/UI bug, take a screenshot and confirm the fix looks correct
- If you cannot visually verify, say so explicitly

## Step 5: Report
- Tell the user in plain language what was wrong and what you changed
- No jargon — explain it like they're not a programmer (because they're not)
- If you found other issues nearby, mention them but do NOT fix them without asking
