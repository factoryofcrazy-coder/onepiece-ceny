# Skener kariet

Záber z kamery → malá sieť nájde štyri rohy karty (`op-det.onnx`, vstup 192×256) → karta sa narovná (`public/scan/core.js`) → EfficientNet-B0 spraví odtlačok (`op-model.onnx`) → porovnanie s indexom (`op-index.*`) → rozhodnutie (`lib/scan/decide.ts`).

- Detektor vidí celú výšku záberu v pomere 3:4, bočné pruhy sú čierne. Karta sa tak zmestí, aj keď vyplní rámik.
- Hlasuje sa za kód karty, nie za verziu: reprinty vyzerajú rovnako. Ak je najbližší súper iná verzia tej istej karty, zoznam ukáže „Over verziu“.
- Index tvoria naše obrázky a oficiálne obrázky Bandai. Číslovanie verzií Bandai sa od našich ID líši, preto sa oficiálny obrázok priradí k verzii podľa vzhľadu (`tools/scan_index.py`).
- Tréning detektora je v `tools/scan-lab` (umelé scény `scene.py`, sieť `detnet.py`, `train_det.py`, export `export_det.py`). Skutočné fotky sa do tréningu nedávajú, slúžia ako nezávislý test.

## Výsledky k 5. 11. 2026
| Test | Skener pred zmenou | Nový |
|---|---|---|
| Video v prehliadači, 10 skutočných kariet, 30 ukázaní, falošná kamera | 19 správnych, 1 zlá, 10 vynechaných | 30 správnych |
| Celý katalóg, 400 umelých scén | nemerané | 382 správna karta (359 presná verzia), 18 nepridaných, 0 zlých |

Test na telefóne a na väčšej vzorke skutočných kariet je ešte potrebné doplniť.
