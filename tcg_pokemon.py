"""Pokémon TCG – obchody, rozpoznanie edície/typu/jazyka a MSRP.

Používa ho onepiece_ceny.py s prepínačom --game pokemon (dáta idú do data/pokemon/, stránka do docs/pokemon/).
Parsery sú spoločné; nový typ „blocks“ je všeobecný parser zoznamu produktov – obchod mu dá len regex,
ktorým sa HTML rozdelí na jednotlivé produkty (názov, cenu, odkaz, obrázok a dostupnosť si nájde sám).
"""
import re

GAME_RX = re.compile(r"pok[eé]mon", re.I)
LABEL = "Pokémon"

# Kategórie, kde sú len Pokémon produkty, majú "all": True – názov produktu nemusí obsahovať „Pokémon“
# (nemecké obchody píšu napr. len „Dunkelnacht Display (deutsch)“). Ostatné sa filtrujú podľa názvu.
SHOPS = {
    # --- Slovensko ---
    "cardempire": {"label": "Card Empire", "parser": "shoptet", "currency": "EUR", "cloud": False, "delay": 3,
                   "urls": ["https://www.cardempire.sk/pokemon/"]},
    "pikazard":   {"label": "Pikazard", "parser": "shoptet", "currency": "EUR", "cloud": False, "delay": 3,
                   "urls": ["https://www.pikazard.eu/pokemon-produkty/"]},
    "veselydrak": {"label": "Veselý drak", "parser": "veselydrak", "currency": "EUR",
                   "urls": [{"url": "https://www.vesely-drak.sk/produkty/booster-boxy/", "kind": "Box"},
                            {"url": "https://www.vesely-drak.sk/produkty/boostery/", "kind": "Pack"},
                            "https://www.vesely-drak.sk/produkty/pokemon-karty/"]},
    "nekonecno":  {"label": "Nekonečno", "parser": "shoptet", "currency": "EUR", "cloud": False, "delay": 3,
                   "urls": ["https://www.nekonecno.sk/pokemon-tcg/"]},
    "poring":     {"label": "Poring Cards", "parser": "shoptet", "currency": "EUR", "cloud": False, "delay": 3,
                   "urls": ["https://www.poringcards.eu/pokemon/"]},
    "kartovo":    {"label": "Kartovo", "parser": "shoptet", "currency": "EUR", "delay": 3,
                   "urls": ["https://www.kartovo.net/pokemon/"]},
    "xzone":      {"label": "Xzone.sk", "parser": "xzone", "currency": "EUR", "delay": 3, "max_pages": 1,
                   "urls": ["https://www.xzone.sk/sberatelske-hry-pokemon-tcg"]},
    "pompo_sk":   {"label": "Pompo.sk", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 3,
                   "blocks": {"split": r'class="catalog-outer"'}, "urls": ["https://pompo.sk/pokemon-tcg/"]},
    "gorila":     {"label": "Gorila.sk", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 2,
                   "blocks": {"split": r'<div class="item">'}, "urls": ["https://www.gorila.sk/seria/pokemon-tcg"]},
    "konzoliste": {"label": "Konzoliste.sk", "parser": "shoptet", "currency": "EUR", "delay": 3, "all": True,
                   "urls": [{"url": "https://www.konzoliste.cz/sk/pokemon-booster-boxy/", "kind": "Box"},
                            {"url": "https://www.konzoliste.cz/sk/pokemon-boostery/", "kind": "Pack"},
                            "https://www.konzoliste.cz/sk/pokemon-elite-trainer-boxy/",
                            "https://www.konzoliste.cz/sk/pokemon-karty-sety-a-kolekce/",
                            "https://www.konzoliste.cz/sk/pokemon-tin-plechovky/"]},
    "gengar":     {"label": "Gengar.sk", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 2,
                   "blocks": {"split": r'<article class="card card-item'},
                   "urls": [{"url": "https://www.gengar.cz/sk/produkty-booster-box", "kind": "Box"},
                            {"url": "https://www.gengar.cz/sk/produkty-booster", "kind": "Pack"},
                            "https://www.gengar.cz/sk/produkty-elite-trainer-box", "https://www.gengar.cz/sk/produkty-collection",
                            "https://www.gengar.cz/sk/produkty-tin", "https://www.gengar.cz/sk/japonske-korejske-boostery-boxy"]},
    # --- Česko ---
    "najada":     {"label": "Najáda", "parser": "jsonld", "currency": "EUR", "all": True,
                   "urls": ["https://www.najada.games/karetni-hry/pokemon"]},
    "tolarie":    {"label": "Tolarie", "parser": "tolarie", "currency": "CZK",
                   "urls": [{"url": "https://www.tolarie.cz/koupit_produkty/katalog/48-pokemon/67-pokemon-booster-boxy/", "kind": "Box"},
                            {"url": "https://www.tolarie.cz/koupit_produkty/katalog/48-pokemon/62-pokemon-boostery/", "kind": "Pack"},
                            "https://www.tolarie.cz/koupit_produkty/katalog/48-pokemon/"]},
    "pokemon4u":  {"label": "Pokemon4U", "parser": "shoptet", "currency": "CZK", "cloud": False, "delay": 3, "all": True,
                   "urls": [{"url": "https://www.pokemon4u.cz/pokemon-booster-box/", "kind": "Box"},
                            {"url": "https://www.pokemon4u.cz/pokemon-booster/", "kind": "Pack"},
                            "https://www.pokemon4u.cz/pokemon-karticky/", "https://www.pokemon4u.cz/pokemon-tin/"]},
    "hrananetu":  {"label": "Hra na netu", "parser": "upgates", "currency": "CZK",
                   "urls": [{"url": "https://www.hrananetu.cz/pokemon-booster-boxy", "kind": "Box"},
                            {"url": "https://www.hrananetu.cz/pokemon-boostery", "kind": "Pack"},
                            "https://www.hrananetu.cz/pokemon-trainer-boxy", "https://www.hrananetu.cz/pokemon-balicky",
                            "https://www.hrananetu.cz/pokemon-tins", "https://www.hrananetu.cz/pokemon"]},
    "wombat":     {"label": "Wombat Games", "parser": "shoptet", "currency": "CZK", "cloud": False, "delay": 3,
                   "urls": ["https://www.wombatgames-shop.cz/kategorie/pokemon/"]},
    "blacklotus": {"label": "Black Lotus", "parser": "shoptet", "currency": "CZK", "cloud": False, "delay": 3,
                   "urls": ["https://www.blacklotus.cz/pokemon-produkty/"]},
    "cardstore":  {"label": "Cardstore", "parser": "shoptet", "currency": "CZK", "cloud": False, "delay": 3,
                   "urls": ["https://www.cardstore.cz/pokemon-produkty/"]},
    "hrydoruky":  {"label": "Hry do ruky", "parser": "hrydoruky", "currency": "CZK", "delay": 2,
                   "urls": ["https://hrydoruky.cz/pokemon-tcg"]},
    "planetaher": {"label": "Planeta her", "parser": "shoptet", "currency": "CZK", "delay": 3,
                   "urls": ["https://www.planetaher.cz/pokemon/"]},
    "tlama":      {"label": "Tlama games", "parser": "shoptet", "currency": "CZK", "delay": 3,
                   "urls": ["https://www.tlamagames.com/pokemon/"]},
    "pokeunited": {"label": "Poké United", "parser": "shoptet", "currency": "CZK", "delay": 3, "all": True,
                   "urls": ["https://www.pokeunited.cz/pokemon/"]},
    "fyft":       {"label": "FYFT", "parser": "shoptet", "currency": "CZK", "delay": 3,
                   "urls": ["https://www.fyft.cz/pokemon/"]},
    "imago":      {"label": "Imago", "parser": "blocks", "currency": "CZK", "delay": 2, "max_pages": 3,
                   "blocks": {"split": r'class="item product"'}, "urls": ["https://www.imago.cz/pokemon-karetni-hra"]},
    "dobrovsky":  {"label": "Knihy Dobrovský", "parser": "blocks", "currency": "CZK", "delay": 2, "max_pages": 3,
                   "blocks": {"split": r'class="price-button-wrap'}, "urls": ["https://www.knihydobrovsky.cz/pokemon-tcg"]},
    "svether":    {"label": "Svět her", "parser": "blocks", "currency": "CZK", "delay": 2, "max_pages": 1,
                   "blocks": {"split": r'class="product columns'}, "urls": ["https://www.svet-her.cz/pokemon/"]},
    "pompo_cz":   {"label": "Pompo.cz", "parser": "blocks", "currency": "CZK", "delay": 2, "max_pages": 3,
                   "blocks": {"split": r'class="catalog-outer"'}, "urls": ["https://pompo.cz/pokemon-tcg/"]},
    # --- Nemecko (posielajú na SK) ---
    "cardcosmos": {"label": "Card Cosmos (DE)", "parser": "shopify", "currency": "EUR", "delay": 2, "all": True,
                   "urls": ["https://cardcosmos.de/collections/pokemon-karten-kaufen"]},
    "playmaniac": {"label": "Play-Maniac (DE)", "parser": "shopify", "currency": "EUR", "delay": 2, "all": True,
                   "urls": ["https://www.play-maniac.de/collections/alle-pokemon-artikel"]},
    "yonko":      {"label": "Yonko TCG (DE)", "parser": "shopify", "currency": "EUR", "delay": 2, "all": True,
                   "urls": ["https://yonko-tcg.de/collections/pokemon"]},
    "crispycards": {"label": "CrispyCards (DE)", "parser": "shopify", "currency": "EUR", "delay": 2,
                    "urls": ["https://crispycards.de/collections/all"]},
    "pushdich":   {"label": "Pushdich TCG (DE)", "parser": "shopify", "currency": "EUR", "delay": 2,
                   "urls": ["https://www.pushdich-tcg.de/collections/all"]},
    "cardcorner": {"label": "Card Corner (DE)", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 3, "all": True,
                   "blocks": {"split": r'itemtype="https?://schema\.org/Product"'}, "urls": ["https://www.card-corner.de/pokemon-karten"]},
    "gate":       {"label": "Gate to the Games (DE)", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 3, "all": True,
                   "blocks": {"split": r'itemtype="https?://schema\.org/Product"'},
                   "urls": [{"url": "https://www.gate-to-the-games.de/Pokemon-Karten/Pokemon-Displays/", "kind": "Box"},
                            "https://www.gate-to-the-games.de/Pokemon-Karten/Pokemon-Booster/"]},
    "comicplanet": {"label": "Comic Planet (DE)", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 3, "all": True,
                    "blocks": {"split": r'class="card product-box'},
                    "urls": ["https://www.comicplanet.de/sammelkarten/pokemon/deutsch/displays-pkm"]},
    "trader":     {"label": "Trader Online (DE)", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 2, "all": True,
                   "blocks": {"split": r'class="card product-card'}, "urls": ["https://trader-online.de/themenwelt-pokemon/"]},
    "geodude":    {"label": "PokeGeoDude (DE)", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 2, "all": True,
                   "blocks": {"split": r'itemtype="https?://schema\.org/Product"', "assume_stock": True},
                   "urls": [{"url": "https://pokegeodude.shop/sammelkarten/pokemon/boosterdisplay", "kind": "Box"},
                            {"url": "https://pokegeodude.shop/sammelkarten/pokemon/booster", "kind": "Pack"},
                            "https://pokegeodude.shop/sammelkarten/pokemon/etb", "https://pokegeodude.shop/sammelkarten/pokemon/collection",
                            "https://pokegeodude.shop/sammelkarten/pokemon/blister"]},
    # --- Rakúsko (posielajú len v rámci AT / osobne vo Viedni) ---
    "funkelpappe": {"label": "Funkelpappe (AT)", "parser": "shopify", "currency": "EUR", "delay": 2, "all": True,
                    "urls": ["https://funkelpappe.at/collections/pokemon"]},
    "mikis":      {"label": "Mikis Card Shop (AT)", "parser": "shopify", "currency": "EUR", "delay": 2, "all": True,
                   "urls": ["https://www.mikiscardshop.at/collections/pokemon"]},
    "rays":       {"label": "Rays Kartenhaus (AT)", "parser": "shopify", "currency": "EUR", "delay": 2, "all": True,
                   "urls": ["https://rays-kartenhaus.at/collections/pokemon-displays"]},
    "sammelmania": {"label": "Sammelmania (AT)", "parser": "blocks", "currency": "EUR", "delay": 2, "max_pages": 3, "all": True,
                    "blocks": {"split": r'class="card product-box'}, "urls": ["https://sammelmania.at/Shop/pokemon-karten"]},
    # --- Japonsko (cena s poštovným, DPH a preclením) ---
    "samurai":    {"label": "Samurai Sword Tokyo (JP)", "parser": "wcstore", "currency": "JPY", "delay": 2,
                   "urls": ["https://samuraiswordtokyo.com/wp-json/wc/store/v1/products?search=pokemon%20booster%20box"]},
    # --- len odkaz (blokujú automatické sťahovanie alebo zoznam načítavajú až v prehliadači) ---
    "alza":       {"label": "Alza.sk", "parser": "jsonld", "currency": "EUR", "enabled": False,
                   "link": "https://www.alza.sk/hracky/pokemon-karty/18879069.htm", "urls": []},
    "smarty":     {"label": "Smarty.sk", "parser": "xmlfeed", "currency": "EUR", "enabled": False,
                   "link": "https://www.smarty.sk/Vyhladavanie?query=pokemon+tcg", "urls": []},
    "butticards": {"label": "ButtiCards (Wien)", "parser": "ecwid", "currency": "EUR", "enabled": False,
                   "link": "https://www.butticards.at/Shop/Pokemon-c72181358", "urls": []},
    "dracik":     {"label": "Dráčik", "parser": "jsonld", "currency": "EUR", "enabled": False,
                   "link": "https://www.dracik.sk/pokemon-1076/", "urls": []},
}

# ----------------------------------------------------- edície (EN + DE názvy) ---
# Kódy: SV01…SV10, ME01…; podedície „.5“ (151 = SV03.5). Poradie: najprv konkrétne názvy, základné sety až na konci.
SETS = [
    ("SV10.5", ["black bolt", "white flare", "schwarze blitze", "weiße flamme", "weisse flamme"]),
    ("SV10", ["destined rivals", "ewige rivalen"]),
    ("SV09", ["journey together", "reisegefährten", "reisegefaehrten"]),
    ("SV08.5", ["prismatic evolution", "prismatische entwicklung"]),
    ("SV08", ["surging sparks", "stürmische funken", "stuermische funken"]),
    ("SV07", ["stellar crown", "stellarkrone"]),
    ("SV06.5", ["shrouded fable", "nebel der sagen"]),
    ("SV06", ["twilight masquerade", "maskerade im zwielicht"]),
    ("SV05", ["temporal forces", "gewalten der zeit"]),
    ("SV04.5", ["paldean fates", "paldeas schicksale"]),
    ("SV04", ["paradox rift", "paradoxrift"]),
    ("SV03", ["obsidian flames", "obsidianflammen"]),
    ("SV02", ["paldea evolved", "entwicklungen in paldea"]),
    ("ME06", ["delta reign", "delta herrschaft"]),
    ("ME05", ["pitch black", "dunkelnacht", "dunkel nacht"]),
    ("ME04", ["chaos rising", "wachsendes chaos"]),
    ("ME03", ["perfect order", "optimale ordnung"]),
    ("ME02.5", ["ascended heroes", "erhabene helden"]),
    ("ME02", ["phantasmal flames", "fatale flammen"]),
    ("30TH", ["30th celebration", "30th anniversary", "30 jahre", "30. jubil", "30 let"]),
    ("SWSH12.5", ["crown zenith", "zenit der könige"]),
    ("SWSH12", ["silver tempest", "silberne sturmwinde"]),
    ("SWSH11", ["lost origin", "verlorener ursprung"]),
    ("SWSH10.5", ["pokemon go", "pokémon go"]),
    ("SWSH10", ["astral radiance", "astralglanz"]),
    ("SWSH09", ["brilliant stars", "strahlende sterne"]),
    ("SWSH08", ["fusion strike", "fusionsangriff"]),
    ("SWSH07", ["evolving skies", "drachenwandel"]),
    ("SWSH06", ["chilling reign", "schaurige herrschaft"]),
    ("SWSH05", ["battle styles", "kampfstile"]),
    ("SWSH04.5", ["shining fates", "glänzendes schicksal"]),
    ("SWSH04", ["vivid voltage", "farbenschock"]),
    ("SWSH03.5", ["champion's path", "champions path", "weg des champs"]),
    ("SWSH03", ["darkness ablaze", "flammende finsternis"]),
    ("SWSH02", ["rebel clash", "clash der rebellen"]),
    ("CEL25", ["celebrations", "25th anniversary", "25 jahre"]),
    ("SM11.5", ["hidden fates", "verborgenes schicksal"]),
    ("ME01", ["mega evolution", "mega-evolution", "mega-entwicklung", "mega entwicklung"]),
    # japonské edície (kódy ako na japonských produktoch)
    ("M5", ["abyss eye"]), ("M4", ["ninja spinner"]), ("M3", ["nihil zero"]), ("M2a", ["mega dream"]),
    ("M2", ["inferno x"]), ("M1S", ["mega symphonia"]), ("M1L", ["mega brave"]), ("MSE", ["storm emeralda"]),
    ("SV11B", ["black bolt jp"]), ("SV10J", ["glory of team rocket"]), ("SV9a", ["heat wave arena"]),
    ("SV9J", ["battle partners"]), ("SV8a", ["terastal festival"]), ("SV8J", ["super electric breaker"]),
    ("SV7a", ["paradise dragona"]), ("SV7J", ["stellar miracle"]), ("SV6a", ["night wanderer"]),
    ("SV6J", ["mask of change"]), ("SV5a", ["crimson haze"]), ("SV5K", ["wild force"]), ("SV5M", ["cyber judge"]),
    ("SV4a", ["shiny treasure"]), ("SV4K", ["ancient roar"]), ("SV4M", ["future flash"]), ("SV3a", ["raging surf"]),
    ("SV3J", ["ruler of the black flame"]), ("SV2a", ["pokemon card 151", "pokémon card 151"]),
    ("SV2D", ["clay burst"]), ("SV2P", ["snow hazard"]), ("SV1a", ["triplet beat"]),
    ("SV01", ["scarlet & violet", "scarlet and violet", "scarlet violet", "karmesin & purpur", "karmesin und purpur"]),
]
SET_LABELS = {
    "SV01": "Scarlet & Violet", "SV02": "Paldea Evolved", "SV03": "Obsidian Flames", "SV03.5": "151",
    "SV04": "Paradox Rift", "SV04.5": "Paldean Fates", "SV05": "Temporal Forces", "SV06": "Twilight Masquerade",
    "SV06.5": "Shrouded Fable", "SV07": "Stellar Crown", "SV08": "Surging Sparks", "SV08.5": "Prismatic Evolutions",
    "SV09": "Journey Together", "SV10": "Destined Rivals", "SV10.5": "Black Bolt / White Flare",
    "ME01": "Mega Evolution", "ME02": "Phantasmal Flames", "ME02.5": "Ascended Heroes", "ME03": "Perfect Order",
    "ME04": "Chaos Rising", "ME05": "Pitch Black", "ME06": "Delta Reign", "30TH": "30th Celebration",
}
# nemecké názvy edícií a produktov → nemecký produkt, aj keď to obchod nepíše
DE_RX = re.compile(r"karmesin|entwicklung|reisegefährten|reisegefaehrten|ewige rivalen|stürmische|stellarkrone|gewalten der zeit|"
                   r"maskerade|obsidianflammen|paradoxrift|schicksale|nebel der sagen|schwarze blitze|weiße flamme|weisse flamme|"
                   r"fatale flammen|optimale ordnung|wachsendes chaos|dunkelnacht|delta herrschaft|erhabene helden|"
                   r"top-trainer|\b\d{2}er[- ]display|sammelkarten|kollektion", re.I)
CODE_RX = re.compile(r"\b(SV|ME|SWSH)\s?-?(\d{1,2})(?:[.,](\d))?\b", re.I)
UPCOMING_RX = re.compile(r"(SV|ME)(\d+)$")      # nevydaná edícia → predobjednávka (rovnako ako OP)


def set_code(name):
    low = name.lower().replace("’", "'")
    for code, names in SETS:
        if any(n in low for n in names):
            return code
    if re.search(r"(?<![\d.,/])151(?![\d.,])", low):
        return "SV03.5"
    m = CODE_RX.search(name)
    if m and not re.search(r"\b(sv|me)\d+[a-z]\b", low):        # japonské kódy (SV8a, M2a) nechaj bez kódu
        ser = m.group(1).upper()
        return f"{ser}{int(m.group(2)):02d}" + (f".{m.group(3)}" if m.group(3) else "")
    return ""


ACCESSORY_RX = re.compile(
    r"sleeve|obal(?!.*kolekc)|\balbum|playmat|spielmatte|podložk|portfolio|deck ?box|storage|card case|acryl|akryl|krabičk|krabick|"
    r"protector|chránič|ochran|magnet|frame|rahmen|rámik|rámeček|stand\b|stojan|toploader|pouzdr|puzdr|samolep|sticker|kartenhülle|hüllen|schutzhülle|ordner|"
    r"ultra ?pro|binder(?! collection)|flip box|9[- ]pocket|4[- ]pocket|zubehör|dice|kocky|kostky|würfel|marker|damage counter", re.I)
OTHER_RX = re.compile(r"figúr|figur(?!en-?kollektion|e collection)|funko|plyš|plüsch|plush|batoh|rucksack|backpack|lego|tričko|t-shirt|"
                      r"ponož|hrnek|hrnček|tasse|puzzle|dvd|blu-?ray|kniha|book|manga|komiks|grading|graded|psa\b|bgs\b|cgc\b|"
                      r"einzelkarte|single card|kusov|\bsingle\b|\bpromo\b(?!.*(box|collection|kolekc|kollektion))|mystery|lucky ?box|repack|"
                      r"spiel(?:zeug|figur)|kuscheltier|ball\b|jumbo|pokéball|pokeball|poké ball", re.I)


def kind_of(name):
    n = name.lower()
    if OTHER_RX.search(n):
        return "Iné"
    if ACCESSORY_RX.search(n) and not re.search(r"(binder|poster|figur\w*|premium|pin)[- ]?(collection|kollektion|kolekc)", n):
        return "Doplnky"
    collection = re.search(r"collection|kollektion|kolekc", n)
    if re.search(r"\bcase\b|\bcarton\b|tin display|bundle display|blister display|\bkarton\b|\d+\s*x\s*(display|booster box|etb)", n):
        return "Case"
    if re.search(r"elite[- ]?trainer|top[- ]?trainer|\betb\b|trainer box", n):
        return "ETB"
    if re.search(r"booster[- ]?bundle|\bbundle\b", n):
        return "Bundle"
    if re.search(r"booster[- ]?box|display|\b(36|30|24|20|18)\s*(booster|packs?|bal)|\bbox\s*\(\s*(36|30)", n):
        return "Box"
    if re.search(r"\btins?\b|plechov", n):
        return "Tin"
    if re.search(r"blister|checklane|\b[23]-?pack|3er|2er|\bpack blister", n):
        return "Blister"
    if re.search(r"\bdeck\b|battle deck|kampfdeck|league battle|build (?:&|and) battle|theme deck|starter|balíček s|stadium", n):
        return "Starter"
    if collection or re.search(r"\bbox\b|\bset\b|kolekce|sada|geschenk|gift|poster", n):
        return "Kolekcia"
    if re.search(r"booster|\bpack\b|packs|balíček|balicek|balík|sleeved", n):
        return "Pack"
    return "Iné"


def lang_of(name):
    if re.search(r"čínsk|cinsk|čínšt|cinst|chinese|chinesisch|\bcn\b|\bs?-?chn\b|simplified|traditional|\bc?sv?\d+(\.\d)?c\b|\bcbb\d", name, re.I):
        return "CN"
    if re.search(r"kórej|korej|korean|koreanisch|\bkr\b|\bkor\b", name, re.I):
        return "KR"
    if re.search(r"japon|japan|\bjp\b|\bjpn?\b|\bjap\b", name, re.I):
        return "JP"
    if re.search(r"deutsch|\bdeu?\b|\(de\)|nemeck|německ|nemčin|german", name, re.I) or DE_RX.search(name):
        return "DE"
    if re.search(r"französ|francúz|francouz|french|\bfr\b|italien|talian|\bit\b|spanisch|španiel|španěl|spanish", name, re.I):
        return "Iný"
    return "EN"


def cardmarket_url(name):
    import urllib.parse
    q = re.sub(r"(?i)^pok[eé]mon( tcg| trading card game| karten| kartičky| karty)?\s*[:\-–]?\s*", "", name)
    q = re.sub(r"(?i)\s*[-–(]\s*(japonsk\w*|japan\w*|jp|en|englisch|english|deutsch|de|asijsk\w*|korejsk\w*|čínsk\w*)\)?\s*$", "", q)
    q = re.sub(r"(?i)\b(scarlet (&|and) violet|mega evolution|karmesin (&|und) purpur|mega-entwicklung)\s*[:\-–]?\s*", "", q).strip(" -–:")
    return "https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=" + urllib.parse.quote(q)


# ---------------------------------------------------------------- MSRP ------
def _lk(table, code):
    if not table:
        return None
    if code in table:
        return table[code]
    fam = re.match(r"[A-Z]+", code or "")
    if fam and fam.group(0) in table:
        return table[fam.group(0)]
    return table.get("default")


def msrp_eur(code, kind, lang, msrp, fx):
    """MSRP v EUR s DPH. EN a DE z amerických cien (USD), JP z japonskej domácej ceny. None = nevieme."""
    ov = msrp.get("override_eur", {}).get(f"{code} {kind} {lang}")
    if ov:
        return float(ov)
    vat = 1 + float(msrp.get("vat", 0.23))
    if lang in ("EN", "DE"):
        sec = msrp.get("en", {})
        usd = {"Pack": _lk(sec.get("pack_usd"), code), "ETB": _lk(sec.get("etb_usd"), code),
               "Bundle": _lk(sec.get("bundle_usd"), code)}.get(kind)
        if kind == "Box":
            if code in sec.get("no_box", []):
                return None
            pack, packs = _lk(sec.get("pack_usd"), code), _lk(sec.get("box_packs"), code)
            usd = pack * packs if pack and packs else None
        return round(usd / fx["USD"] * vat, 2) if usd and code else None
    if lang == "JP" and kind in ("Pack", "Box") and code:
        sec = msrp.get("jp", {})
        pack = _lk(sec.get("pack_jpy"), code)
        if not pack:
            return None
        per = pack / 1.10 / fx["JPY"] * vat
        return round(per if kind == "Pack" else per * (_lk(sec.get("box_packs"), code) or 0), 2) or None
    return None


def box_packs(code, lang, msrp, name=""):
    m = re.search(r"(\d{2})\s*(?:x|er|-?pack)?\s*(?:booster|balíč|balic|packs?\b|bal\.|display)", name, re.I)
    if m and 10 <= int(m.group(1)) <= 36:
        return int(m.group(1))
    if lang in ("EN", "DE") and code and code not in msrp.get("en", {}).get("no_box", []):
        return _lk(msrp.get("en", {}).get("box_packs"), code)
    if lang == "JP" and code:
        return _lk(msrp.get("jp", {}).get("box_packs"), code)
    return None
