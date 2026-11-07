"""Rules for the reviewed credit notes in data/direct-notes.json (shared by validate.py and the tests)."""
import re

PREDECESSOR=re.compile(r'https://github\.com/[\w.-]+/[\w.-]+/(issues|pull)/\d+')

def predecessor_ok(note):
    # The predecessor is optional: a row whose lineage is not a verifier submission has none. If present, it must be a
    # verifier issue or pull request (the tooltip shows it as the "Source of the earlier result" link).
    return 'predecessor' not in note or bool(PREDECESSOR.fullmatch(note['predecessor']))

def credit_ok(credit):
    """A display credit (Other bounds rows only): {'author': one plain-text line, 'names': 1 to 30 distinct names}, in
    credit order. Plain text: no markup, no TeX, no control characters, no leading or trailing space."""
    plain=lambda x,n:isinstance(x,str) and 0<len(x.strip())==len(x)<=n and not re.search(r'[<>&$\\]',x) and all(ord(c)>=32 for c in x)
    return (isinstance(credit,dict) and set(credit)=={'author','names'} and plain(credit['author'],500) and isinstance(credit['names'],list)
            and 0<len(credit['names'])<=30 and len(set(credit['names']))==len(credit['names']) and all(plain(x,120) for x in credit['names']))
