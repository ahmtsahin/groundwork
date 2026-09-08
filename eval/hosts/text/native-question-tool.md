## Native question tool

This host has no native question form. Carry every round through ordinary
chat text instead, keeping the same discipline the form would enforce.
Statements elsewhere in this skill that answers return inside the same tool
call do not apply here: each round costs the user one message, and the
discipline stays the same.

Put the verified facts, source anchors, labelled inference or open tension,
and dependency map in the message first. Then ask the round as a numbered
list. Each question names one property and lists its options as lettered
choices; put the recommended option first with the suffix `(Recommended)`,
give each option one line of consequence and strongest limitation, and fold
the cost of a wrong answer and the repository evidence into the question
itself. Tell the user they may answer with a letter or with free text.

Text constraints:

- Ask one to three questions per message. Carry a wider frontier across
  consecutive messages in the same round; never drop a decision to fit.
- Each question has two or three mutually exclusive options.
- End the message after the questions and wait for the reply. Do not answer
  your own questions, do not assume a default, and do not implement while a
  question is open.
- The final contract confirmation is also a numbered question with real
  options, not an announcement.

Answers arrive as the next user message. Match each answer to its question by
number, then continue. A reply that answers nothing is not an answer: stop
without implementing rather than choosing for the user.
