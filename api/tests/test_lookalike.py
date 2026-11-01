from app.pipeline.lookalike import compare, is_free_mail, levenshtein, registrable


def test_levenshtein():
    assert levenshtein("infosys", "infosys") == 0
    assert levenshtein("infosys", "infosis") == 1
    assert levenshtein("kitten", "sitting") == 3


def test_registrable():
    assert registrable("careers.infosys.com") == "infosys.com"
    assert registrable("www.tcs.co.in") == "tcs.co.in"


def test_exact_and_subdomain():
    assert compare("infosys.com", "infosys.com") == "exact"
    assert compare("careers.infosys.com", "infosys.com") == "subdomain"


def test_free_mail():
    assert compare("gmail.com", "infosys.com") == "free_mail"
    assert is_free_mail("rediffmail.com")
    assert compare("yahoo.co.in", "") == "free_mail"


def test_suffix_tricks():
    assert compare("infosys-careers.com", "infosys.com") == "lookalike"
    assert compare("infosys-hr.in", "infosys.com") == "lookalike"
    assert compare("wiprojobs.com", "wipro.com") == "lookalike"
    assert compare("accenture-recruitment.org", "accenture.com") == "lookalike"


def test_typo_and_homoglyph():
    assert compare("infosyss.com", "infosys.com") == "lookalike"
    assert compare("rnicrosoft.com", "microsoft.com") == "lookalike"
    assert compare("g00gle.com", "google.com") == "lookalike"
    assert compare("xn--infsys-0ta.com", "infosys.com") == "lookalike"


def test_tld_swap():
    assert compare("infosys.co", "infosys.com") == "lookalike"


def test_different():
    assert compare("zomato.com", "infosys.com") == "different"
    assert compare("acme.com", "") == "different"
