## Native question tool

Codex carries every round through its built-in `request_user_input` tool in
Default mode. The host must have the
`default_mode_request_user_input` feature enabled. If the tool is absent,
stop before implementation and tell the operator to run:

`codex features enable default_mode_request_user_input`

Do not silently replace the native form with prose questions; native Default
mode input is this plugin's Codex contract.

Put the verified facts, source anchors, labelled inference or open tension, and
dependency map in assistant text immediately before the call. Then call:

```json
{
  "questions": [
    {
      "id": "stable-id",
      "header": "12 chars max",
      "question": "One property? State what a wrong answer costs, then what the repository proves with an anchor.",
      "options": [
        {
          "label": "Short choice (Recommended)",
          "description": "Consequence and strongest limitation."
        },
        {
          "label": "Other choice",
          "description": "Consequence and strongest limitation."
        }
      ]
    }
  ]
}
```

Native constraints:

- Ask one to three questions per call. Carry a wider frontier across consecutive
  calls in the same round; never drop a decision to fit the cap.
- `header` is at most twelve characters. It is a chip, not a sentence.
- Each question has two or three mutually exclusive options. Labels are one to
  five words; put the recommendation first and suffix its label with
  `(Recommended)`.
- There are no separate context, why, evidence, or recommendation fields. Keep
  context before the call and fold the stake and evidence into `question`.
- Do not add an Other option. The client adds the free-form Other choice.
- The tool belongs to the root thread. Keep decision rounds in the root thread.

Answers return inside the same call, keyed by question id. Process them and
continue in the current turn. A dismissal is not an answer: stop without
implementing rather than choosing for the user.
