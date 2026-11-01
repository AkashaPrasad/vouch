"""Host classification and brand knowledge.

A job post on linkedin.com, a Google Form, a bit.ly link or a wixsite.com page is a *platform*, never the
company's own domain. Platforms must not earn green credit (domain age, MX records) and must not be
compared against the official site as if they were the sender. This module decides what a host *is*.
"""
import re

from app.pipeline.lookalike import FREE_MAIL, label, registrable

# Category -> hosts. Match is exact host or any subdomain of it.
JOB_BOARDS = {
    "linkedin.com", "lnkd.in", "naukri.com", "naukrigulf.com", "indeed.com", "indeed.co.in", "internshala.com", "glassdoor.com",
    "glassdoor.co.in", "foundit.in", "monsterindia.com", "monster.com", "shine.com", "apna.co", "timesjobs.com", "freshersworld.com",
    "unstop.com", "wellfound.com", "angel.co", "cutshort.io", "hirist.tech", "hirist.com", "instahyre.com", "iimjobs.com", "workindia.in",
    "quikr.com", "olx.in", "upwork.com", "fiverr.com", "freelancer.com", "jobhai.com", "ziprecruiter.com", "simplyhired.com",
    "careerjet.co.in", "jooble.org", "talent.com", "placementindia.com", "hirect.in", "joinsuperset.com", "letsintern.com",
    "hellointern.com", "internshipbazaar.com", "jobsforher.com", "herkey.com", "expertrons.com", "turing.com", "toptal.com",
    "remoteok.com", "weworkremotely.com",
}
ATS = {
    "lever.co", "greenhouse.io", "myworkdayjobs.com", "smartrecruiters.com", "workable.com", "jobvite.com", "icims.com", "taleo.net",
    "successfactors.com", "zohorecruit.com", "ashbyhq.com", "rippling.com", "freshteam.com", "keka.com", "darwinbox.in", "bamboohr.com",
    "recruitee.com", "breezy.hr", "applytojob.com", "teamtailor.com", "personio.com", "careers-page.com", "skillate.com", "turbohire.co",
    "hirehive.com", "pinpointhq.com", "eightfold.ai", "phenom.com", "avature.net", "oraclecloud.com", "brassring.com", "ultipro.com",
    "paylocity.com", "dover.com", "wellfound.com", "homerun.co", "jobs.netflix.com",
}
SOCIAL = {
    "facebook.com", "fb.com", "fb.me", "m.me", "instagram.com", "twitter.com", "x.com", "youtube.com", "youtu.be", "reddit.com",
    "quora.com", "medium.com", "pinterest.com", "threads.net", "snapchat.com", "tiktok.com", "koo.app", "sharechat.com", "moj.app",
}
MESSAGING = {
    "t.me", "telegram.me", "telegram.org", "telegram.dog", "wa.me", "whatsapp.com", "chat.whatsapp.com", "api.whatsapp.com",
    "signal.me", "signal.org", "discord.gg", "discord.com", "messenger.com", "imo.im", "viber.com", "skype.com", "join.skype.com",
}
FORM_OR_DOC = {
    "forms.gle", "docs.google.com", "drive.google.com", "sites.google.com", "sheets.google.com", "typeform.com", "jotform.com",
    "surveymonkey.com", "airtable.com", "notion.site", "notion.so", "tally.so", "forms.office.com", "onedrive.live.com", "1drv.ms",
    "dropbox.com", "canva.site", "canva.com", "forms.zohopublic.com", "zoho.com", "paperform.co", "fillout.com", "formstack.com",
    "cognitoforms.com", "wufoo.com", "123formbuilder.com", "forms.app", "docs.zoho.com", "scribd.com", "slideshare.net",
}
SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "rb.gy", "cutt.ly", "shorturl.at", "is.gd", "ow.ly", "buff.ly", "tiny.cc", "rebrand.ly",
    "s.id", "v.gd", "bl.ink", "short.io", "tiny.one", "t.ly", "shorturl.asia", "u.to", "clck.ru", "surl.li", "rb.gy", "zws.im",
    "shrtco.de", "l.linklyhq.com", "qrco.de", "qr.ae",
}
FREE_HOSTS = {
    "wixsite.com", "wix.com", "weebly.com", "webnode.com", "webnode.page", "blogspot.com", "wordpress.com", "github.io", "netlify.app",
    "vercel.app", "pages.dev", "herokuapp.com", "glitch.me", "repl.co", "replit.app", "carrd.co", "strikingly.com", "mystrikingly.com",
    "squarespace.com", "godaddysites.com", "webflow.io", "framer.website", "framer.app", "lovable.app", "bubbleapps.io", "site123.me",
    "yolasite.com", "000webhostapp.com", "firebaseapp.com", "web.app", "surge.sh", "onrender.com", "ngrok.io", "ngrok-free.app",
    "ngrok.app", "linktr.ee", "bio.link", "beacons.ai", "taplink.cc", "about.me", "hostinger.site", "my.canva.site", "systeme.io",
    "mailchimpsites.com", "google.site", "sites.google.com", "pages.github.io", "infinityfreeapp.com", "rf.gd", "epizy.com",
    "duckdns.org", "no-ip.org", "freewebhostmost.com", "blogger.com", "tumblr.com", "jimdosite.com", "jimdofree.com", "ucoz.com",
    "weeblysite.com", "odoo.com", "shopify.com", "myshopify.com", "wordpress.org", "hubspotpagebuilder.com", "unbounce.com",
}
PAYMENT = {
    "paytm.me", "p.paytm.me", "razorpay.me", "rzp.io", "pages.razorpay.com", "payu.in", "instamojo.com", "imjo.in", "phon.pe",
    "phonepe.com", "gpay.app.goo.gl", "pay.google.com", "paypal.me", "paypal.com", "cashfree.com", "payments.cashfree.com",
    "payumoney.com", "ccavenue.com", "upi.link", "bharatpe.in", "mobikwik.com", "freecharge.in", "amazon.in/pay", "stripe.com",
    "buy.stripe.com", "checkout.stripe.com", "binance.com", "coinbase.com", "trustwallet.com", "wazirx.com", "coindcx.com",
}
REFERENCE = {
    "zaubacorp.com", "tofler.in", "thecompanycheck.com", "wikipedia.org", "crunchbase.com", "ambitionbox.com", "justdial.com",
    "indiamart.com", "sulekha.com", "mca.gov.in", "cybercrime.gov.in", "economictimes.indiatimes.com", "livemint.com", "ndtv.com",
    "timesofindia.indiatimes.com", "thehindu.com", "hindustantimes.com", "indianexpress.com", "news18.com", "moneycontrol.com",
    "business-standard.com", "financialexpress.com", "yourstory.com", "inc42.com", "entrackr.com", "tracxn.com", "signalhire.com",
    "rocketreach.co", "apollo.io", "zoominfo.com", "dnb.com", "opencorporates.com", "trustpilot.com", "mouthshut.com",
    "consumercomplaints.in", "scamadviser.com", "scamdetector.com", "bing.com", "duckduckgo.com",
}
CATEGORY_LABEL = {
    "company": "company site", "ats": "careers portal", "job_board": "job board", "social": "social network", "messaging": "messaging app",
    "form_or_doc": "form / document", "shortener": "link shortener", "free_host": "free site builder", "payment": "payment link",
    "reference": "reference site", "free_mail": "free email",
}
_TABLE = [("free_mail", FREE_MAIL), ("ats", ATS), ("shortener", SHORTENERS), ("form_or_doc", FORM_OR_DOC), ("messaging", MESSAGING),
          ("payment", PAYMENT), ("job_board", JOB_BOARDS), ("social", SOCIAL), ("free_host", FREE_HOSTS), ("reference", REFERENCE)]


def _host(s: str) -> str:
    h = (s or "").strip().lower().rstrip(".")
    h = re.sub(r"^https?://", "", h).split("/")[0].split("?")[0].split(":")[0]
    return h[4:] if h.startswith("www.") else h


def classify(host_or_url: str) -> str:
    """Return the category of a host: 'company' when it is not a known platform."""
    h = _host(host_or_url)
    if not h:
        return "company"
    for cat, hosts in _TABLE:
        for entry in hosts:
            if h == entry or h.endswith("." + entry):
                return cat
    # google.com itself is a company domain; its doc/form subdomains were matched above.
    return "company"


def is_platform(host_or_url: str) -> bool:
    return classify(host_or_url) != "company"


def describe(host_or_url: str) -> str:
    """'linkedin.com (job board)' for user-facing summaries."""
    h = _host(host_or_url)
    return f"{registrable(h)} ({CATEGORY_LABEL[classify(h)]})"


# ---------------------------------------------------------------- known brands
# alias -> official registrable domains. Aliases are matched as whole tokens of the normalised company name.
KNOWN_BRANDS: dict[str, tuple[str, list[str]]] = {}


def _brand(name: str, domains: list[str], *aliases: str) -> None:
    for a in (name, *aliases):
        KNOWN_BRANDS[re.sub(r"[^a-z0-9]", "", a.lower())] = (name, domains)


_brand("Tata Consultancy Services", ["tcs.com", "tata.com"], "TCS", "Tata Consultancy")
_brand("Infosys", ["infosys.com"], "Infosys Limited", "Infosys BPM")
_brand("Wipro", ["wipro.com"])
_brand("HCLTech", ["hcltech.com", "hcl.com"], "HCL", "HCL Technologies")
_brand("Accenture", ["accenture.com"])
_brand("Capgemini", ["capgemini.com"])
_brand("Cognizant", ["cognizant.com"], "CTS")
_brand("Tech Mahindra", ["techmahindra.com"], "TechM")
_brand("LTIMindtree", ["ltimindtree.com"], "Mindtree", "LTI")
_brand("Mphasis", ["mphasis.com"])
_brand("Persistent Systems", ["persistent.com"], "Persistent")
_brand("Hexaware", ["hexaware.com"])
_brand("IBM", ["ibm.com"])
_brand("Amazon", ["amazon.com", "amazon.in", "amazon.jobs"], "AWS", "Amazon Web Services")
_brand("Flipkart", ["flipkart.com", "flipkartcareers.com"])
_brand("Google", ["google.com", "withgoogle.com", "youtube.com"], "Alphabet", "YouTube")
_brand("Microsoft", ["microsoft.com"])
_brand("Apple", ["apple.com"])
_brand("Meta", ["meta.com", "facebook.com", "fb.com"], "Facebook", "Instagram", "WhatsApp")
_brand("Netflix", ["netflix.com"])
_brand("NVIDIA", ["nvidia.com"])
_brand("Intel", ["intel.com"])
_brand("Qualcomm", ["qualcomm.com"])
_brand("Cisco", ["cisco.com"])
_brand("Dell", ["dell.com"], "Dell Technologies")
_brand("HP", ["hp.com", "hpe.com"], "Hewlett Packard", "Hewlett Packard Enterprise", "HPE")
_brand("Oracle", ["oracle.com"])
_brand("SAP", ["sap.com"], "SAP Labs")
_brand("Adobe", ["adobe.com"])
_brand("Salesforce", ["salesforce.com"])
_brand("ServiceNow", ["servicenow.com"])
_brand("Atlassian", ["atlassian.com"])
_brand("Samsung", ["samsung.com"])
_brand("Uber", ["uber.com"])
_brand("Ola", ["olacabs.com", "olaelectric.com"], "Ola Cabs", "Ola Electric")
_brand("Zomato", ["zomato.com", "eternal.com"])
_brand("Swiggy", ["swiggy.com", "swiggy.in"])
_brand("Paytm", ["paytm.com", "one97.com"], "One97")
_brand("PhonePe", ["phonepe.com"])
_brand("Razorpay", ["razorpay.com"])
_brand("Zoho", ["zoho.com", "zohocorp.com"], "Zoho Corporation")
_brand("Freshworks", ["freshworks.com"])
_brand("Reliance", ["ril.com", "jio.com", "reliance.com"], "Reliance Industries", "Jio", "Reliance Jio", "Reliance Retail")
_brand("Tata", ["tata.com"], "Tata Group", "Tata Sons")
_brand("Byju's", ["byjus.com"], "Byjus", "Think and Learn")
_brand("Meesho", ["meesho.com"])
_brand("Deloitte", ["deloitte.com"])
_brand("EY", ["ey.com"], "Ernst & Young", "Ernst and Young")
_brand("KPMG", ["kpmg.com"])
_brand("PwC", ["pwc.com"], "PricewaterhouseCoopers")
_brand("McKinsey", ["mckinsey.com"], "McKinsey & Company")
_brand("BCG", ["bcg.com"], "Boston Consulting Group")
_brand("Bain", ["bain.com"], "Bain & Company")
_brand("Goldman Sachs", ["gs.com", "goldmansachs.com"])
_brand("JPMorgan", ["jpmorgan.com", "jpmorganchase.com", "jpmchase.com"], "JP Morgan", "JPMorgan Chase", "J.P. Morgan")
_brand("Morgan Stanley", ["morganstanley.com"])
_brand("Barclays", ["barclays.com"])
_brand("HSBC", ["hsbc.com", "hsbc.co.in"])
_brand("ICICI Bank", ["icicibank.com"], "ICICI")
_brand("HDFC Bank", ["hdfcbank.com"], "HDFC")
_brand("State Bank of India", ["sbi.co.in", "onlinesbi.sbi"], "SBI")
_brand("Axis Bank", ["axisbank.com"], "Axis")
_brand("Kotak", ["kotak.com"], "Kotak Mahindra Bank")
_brand("Walmart", ["walmart.com"], "Walmart Global Tech")
_brand("Nykaa", ["nykaa.com"])
_brand("CRED", ["cred.club"])
_brand("Groww", ["groww.in"])
_brand("Zerodha", ["zerodha.com"])
_brand("Upstox", ["upstox.com"])
_brand("Dream11", ["dream11.com", "dreamsports.group"])
_brand("Unacademy", ["unacademy.com"])
_brand("Physics Wallah", ["pw.live"], "PhysicsWallah", "PW")
_brand("Vedantu", ["vedantu.com"])
_brand("Urban Company", ["urbancompany.com"])
_brand("Delhivery", ["delhivery.com"])
_brand("Mahindra", ["mahindra.com"], "Mahindra & Mahindra")
_brand("Maruti Suzuki", ["marutisuzuki.com"], "Maruti")
_brand("Larsen & Toubro", ["larsentoubro.com", "lntecc.com"], "L&T", "LnT")
_brand("Bajaj Finserv", ["bajajfinserv.in"], "Bajaj Finance")
_brand("Airtel", ["airtel.in", "airtel.com"], "Bharti Airtel")
_brand("Vodafone Idea", ["myvi.in", "vodafoneidea.com"], "Vi")
_brand("LinkedIn", ["linkedin.com"])
_brand("Naukri", ["naukri.com", "infoedge.in"], "Info Edge")
_brand("Internshala", ["internshala.com"])
_brand("Amazon Development Centre", ["amazon.com", "amazon.in", "amazon.jobs"])
_brand("Coforge", ["coforge.com"])
_brand("Zensar", ["zensar.com"])
_brand("Cyient", ["cyient.com"])
_brand("Birlasoft", ["birlasoft.com"])
_brand("Sonata Software", ["sonata-software.com"], "Sonata")
_brand("KPIT", ["kpit.com"])
_brand("Tata Elxsi", ["tataelxsi.com"])
_brand("Tata Motors", ["tatamotors.com"])
_brand("Tata Steel", ["tatasteel.com"])
_brand("Nestle", ["nestle.in", "nestle.com"], "Nestlé")
_brand("Hindustan Unilever", ["hul.co.in", "unilever.com"], "HUL", "Unilever")
_brand("ITC", ["itcportal.com"])
_brand("Indian Oil", ["iocl.com"], "IOCL")
_brand("ONGC", ["ongcindia.com"])
_brand("BHEL", ["bhel.com"])
_brand("NTPC", ["ntpc.co.in"])
_brand("ISRO", ["isro.gov.in"])
_brand("DRDO", ["drdo.gov.in"])
_brand("Indian Railways", ["indianrailways.gov.in", "rrbcdg.gov.in", "irctc.co.in"], "RRB", "IRCTC")
_brand("UPSC", ["upsc.gov.in"])
_brand("SSC", ["ssc.gov.in", "ssc.nic.in"], "Staff Selection Commission")

STOP = {"pvt", "private", "ltd", "limited", "llp", "inc", "corp", "corporation", "co", "company", "technologies", "technology",
        "solutions", "services", "india", "software", "tech", "infotech", "systems", "global", "group", "international", "the",
        "of", "and", "careers", "hr", "recruitment", "team", "hiring", "talent"}


def known_brand(company_name: str) -> dict | None:
    """{'name', 'official_domains'} when the company name is (or contains as a whole token) a well-known employer."""
    if not company_name:
        return None
    raw = company_name.lower()
    all_tokens = re.findall(r"[a-z0-9&.']+", raw)
    full = re.sub(r"[^a-z0-9]", "", "".join(t for t in all_tokens if t not in {"pvt", "private", "ltd", "limited", "llp", "inc", "the"}))
    if full in KNOWN_BRANDS:
        name, doms = KNOWN_BRANDS[full]
        return {"name": name, "official_domains": doms}
    tokens = [t for t in all_tokens if t not in STOP]
    whole = re.sub(r"[^a-z0-9]", "", "".join(tokens))
    if whole in KNOWN_BRANDS:
        name, doms = KNOWN_BRANDS[whole]
        return {"name": name, "official_domains": doms}
    # multi-token aliases ("tata consultancy services") then single tokens ("infosys")
    for n in (3, 2, 1):
        for i in range(len(tokens) - n + 1):
            key = re.sub(r"[^a-z0-9]", "", "".join(tokens[i:i + n]))
            if key in KNOWN_BRANDS and (n > 1 or len(key) >= 3):
                name, doms = KNOWN_BRANDS[key]
                return {"name": name, "official_domains": doms}
    return None


def brand_in_label(domain: str, brand: dict) -> bool:
    """True when the domain's label contains the brand name (e.g. infosys-careers.in for Infosys)."""
    lbl = re.sub(r"[^a-z0-9]", "", label(domain).lower())
    for alias, (name, _) in KNOWN_BRANDS.items():
        if name == brand["name"] and len(alias) >= 3 and alias in lbl:
            return True
    return False


# ---------------------------------------------------------------- extraction helpers
def hosts_of(extraction: dict) -> list[dict]:
    """Every distinct host in the message with its category. Emails contribute their domain."""
    from app.pipeline.extract import domain_of
    seen: dict[str, str] = {}
    for u in extraction.get("urls", []):
        h = domain_of(u)
        if h and h not in seen:
            seen[h] = classify(h)
    for m in extraction.get("sender_emails", []):
        h = domain_of(m)
        if h and h not in seen:
            seen[h] = classify(h)
    cod = extraction.get("claimed_official_domain") or ""
    if cod and cod not in seen:
        seen[cod] = classify(cod)
    return [{"host": h, "category": c} for h, c in seen.items()]


def company_domains(extraction: dict) -> list[str]:
    """Registrable company-category domains in priority order: corporate sender email, then linked sites."""
    out: list[str] = []
    for item in hosts_of(extraction):
        if item["category"] == "company":
            r = registrable(item["host"])
            if r not in out:
                out.append(r)
    # corporate email domains first
    from app.pipeline.extract import domain_of
    mail = [registrable(domain_of(m)) for m in extraction.get("sender_emails", [])]
    mail = [m for m in mail if m in out]
    return mail + [d for d in out if d not in mail]


def platform_hosts(extraction: dict) -> list[dict]:
    return [h for h in hosts_of(extraction) if h["category"] != "company"]


def shortener_urls(urls: list[str]) -> list[str]:
    return [u for u in urls if classify(u) == "shortener"]


def payment_urls(urls: list[str]) -> list[str]:
    return [u for u in urls if classify(u) == "payment" or u.lower().startswith("upi://")]


def company_slug_in(url_or_host: str, company: str) -> bool:
    """True when a compact form of the company name appears in the host or path (jobs.lever.co/navi, navi.darwinbox.in)."""
    key = re.sub(r"[^a-z0-9]", "", re.sub(r"\b(pvt|private|ltd|limited|llp|inc|technologies|technology|solutions|services|india|software|tech|infotech|labs)\b", "", company.lower()))
    if len(key) < 3:
        return False
    return key in re.sub(r"[^a-z0-9]", "", url_or_host.lower())
