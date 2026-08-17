## Activate Environment

(local; for myself) `source /Users/neerajaabhyankar/Library/Caches/pypoetry/virtualenvs/ml-playground-U3_zo12P-py3.11/bin/activate.fish`

(general; for new installs) `pip install -r requirements.txt`

## Goal

I'd like to make a "smart" knot editor. Capabilities included, but not limited to:
- Draw a knot or link that I have in mind
- Easily edit it (i.e. cut/tie/untie ends)
- Execute Reidmeister moves
- Be able to ask questions:
    - "Is this an unknot?" --> Classify knots
    - "Is this chiral?"
    - "Is this link splittable?" --> Classify links
- Be able to rotate the view in 3D ambient space
- [Stretch goal] Given a real-life photo of a knot/link, infer its skeleton
- [Stretch goal] Given a knot/link projection diagram, generate a natural-looking image in a specific style
- And more...

Basically, the user should feel like they have actual gravity-free strings in their hands.

