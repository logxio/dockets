from pipeline.document_parse import parse_text_to_brief


def test_parse_text_to_brief_caption_and_court():
    text = """
    UNITED STATES DISTRICT COURT
    NORTHERN DISTRICT OF CALIFORNIA

    ACME, INC., v. BETA LLC

    COMPLAINT FOR BREACH OF CONTRACT
    Damages exceed $5,000,000.
    Client role: Defendant
    Opposing counsel: Skadden, Arps, Slate, Meagher & Flom LLP
    Estimated litigation budget (USD): 500,000
    Notes: Fast injunction risk assessment; prefer alternative fee discussion.
    """
    parsed = parse_text_to_brief(text)
    assert parsed.brief["court"]
    assert parsed.brief["caseType"] in ("contract", "other")
    assert parsed.brief["extracted"]["plaintiff"]
    assert parsed.brief["extracted"]["defendant"]
    assert parsed.brief["role"] == "defendant"
    assert parsed.brief["opponentName"]
    assert parsed.brief["opponentCounsel"]
    assert parsed.brief["constraints"]["budgetUsd"] == 500000
    assert parsed.brief["notes"]
