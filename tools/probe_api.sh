mkdir -p tools/api
q() { curl -s -m 60 -X POST https://api.tcgdex.net/v2/graphql -H 'content-type: application/json' -d "$1"; }
q '{"query":"{ __type(name:\"VariantDetailed\") { fields { name type { name kind ofType { name } } } } }"}' > tools/api/g1.txt
q '{"query":"{ set(id:\"me02\") { id name releaseDate cardCount { total official } cards { id localId name image rarity category variants_detailed { type } } } }"}' | head -c 2500 > tools/api/g2.txt
q '{"query":"{ cards(filters:{set:\"me02\"}, pagination:{page:1,itemsPerPage:3}) { id name variants_detailed { type pricing { cardmarket { trend avg } } } } }"}' | head -c 3000 > tools/api/g3.txt
q '{"query":"{ sets { id name releaseDate serie { id name } cardCount { total official } } }"}' | head -c 1500 > tools/api/g4.txt
curl -s -m 60 -w '\nTIME %{time_total} SIZE %{size_download}\n' -X POST https://api.tcgdex.net/v2/graphql -H 'content-type: application/json' -d '{"query":"{ set(id:\"sv08\") { cards { id localId name image rarity variants_detailed { type pricing { cardmarket { trend avg low } tcgplayer { unit } } } } } }"}' | tail -c 600 > tools/api/g5.txt
curl -s -m 60 'https://api.tcgdex.net/v2/en/series' | head -c 1500 > tools/api/g6.txt
curl -s -m 60 'https://api.tcgdex.net/v2/en/sets/sv08' | python3 -c "import json,sys;d=json.load(sys.stdin);print({k:v for k,v in d.items() if k!='cards'})" > tools/api/g7.txt
