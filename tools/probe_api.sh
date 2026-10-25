set -x
mkdir -p tools/api
curl -s -m 30 https://api.tcgdex.net/v2/en/sets | head -c 3000 > tools/api/tcgdex_sets.txt
curl -s -m 30 https://api.tcgdex.net/v2/en/sets/me02 | head -c 4000 > tools/api/tcgdex_set_me02.txt
curl -s -m 30 https://api.tcgdex.net/v2/en/cards/me02-001 > tools/api/tcgdex_card.txt
curl -s -m 30 -X POST https://api.tcgdex.net/v2/graphql -H 'content-type: application/json' -d '{"query":"{ cards(filters:{}, pagination:{page:1,itemsPerPage:2}) { id name image rarity set { id name } pricing { cardmarket { avg trend unit } } } }"}' > tools/api/tcgdex_gql.txt
curl -s -m 30 -X POST https://api.tcgdex.net/v2/graphql -H 'content-type: application/json' -d '{"query":"{ __type(name:\"Card\") { fields { name } } }"}' > tools/api/tcgdex_gql_fields.txt
curl -s -m 30 'https://api.tcgdex.net/v2/en/cards?set.id=eq:me02&pagination:itemsPerPage=3' | head -c 3000 > tools/api/tcgdex_cards_filter.txt
curl -s -m 30 -o /dev/null -w '%{http_code} %{size_download}\n' 'https://api.pokemontcg.io/v2/cards?q=set.id:sv8&pageSize=250' > tools/api/ptcgio.txt
curl -s -m 30 'https://api.pokemontcg.io/v2/cards?q=set.id:sv8&pageSize=2' | head -c 3000 >> tools/api/ptcgio.txt
ls -la tools/api
