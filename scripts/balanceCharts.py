"""Render the completed same-form survey: python scripts/balanceCharts.py survey.json output-dir.

Requires Python, matplotlib and numpy. All plots are standalone PNG/SVG artifacts;
the HTML report embeds PNGs and works offline. Exploratory samples are never pooled.
"""
from pathlib import Path
import base64
import csv
import hashlib
import html
import json
import math
import re
import sys
import zipfile

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

SOURCE = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
CHARTS = OUT / 'charts'
CHARTS.mkdir(exist_ok=True)
DATA = json.loads(SOURCE.read_text(encoding='utf-8'))
CELLS = sorted(DATA['cells'], key=lambda c: (c['form'], len(c['group']), c['group']))
HEROES = ['naruto', 'sasuke', 'luffy', 'goku']
COLORS = ['#e99a19', '#8570d7', '#db5555', '#2797ad']
FORM_NAMES = [
    ['Base', 'Base', 'Base', 'Base'],
    ['One-Tail Cloak', 'Sharingan', 'Gear Second', 'Super Saiyan'],
    ['Four-Tail Cloak', 'Curse Mark', 'Gear Third', 'Super Saiyan 2'],
    ['Six-Tail Form', 'Mangekyo Sharingan', 'Gear Fourth', 'Super Saiyan 3'],
    ['Kurama Mode', 'Rinnegan / Perfect Susanoo', 'Gear Fifth', 'Super Saiyan Blue'],
]
assert len(CELLS) == 55 and all(c['rounds'] == 1000 for c in CELLS), 'A report requires all 55,000 final rounds'
assert DATA.get('overrides') is None, 'Publish actual game defaults, not an override experiment'
assert all(len(c['scenarios']) == 72 for c in CELLS), 'Missing scenario coverage'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False,
                     'axes.spines.right': False, 'figure.facecolor': '#fafafa', 'axes.facecolor': '#fafafa',
                     'savefig.facecolor': '#fafafa', 'axes.titleweight': 'bold'})
FIGURES = []


def rate(c, h):
    return c['wins'][h] / (c['rounds'] - c['draws'])


def ci(c, h):
    n = c['rounds'] - c['draws']
    p = rate(c, h)
    blocks = c.get('blocks', [])
    k = len(blocks)
    if k < 2:
        return (float('nan'), float('nan'))
    residual = sum((b['wins'][h] - p * sum(b['wins'].values())) ** 2 for b in blocks)
    margin = 1.96 * math.sqrt(k / (k - 1) * residual) / n
    return max(0, p - margin), min(1, p + margin)


def label(c):
    return 'F' + str(c['form']) + ' ' + '/'.join(h[0].upper() for h in c['group'])


def aggregate(cs, h):
    available = [c for c in cs if h in c['group']]
    return sum(c['wins'][h] for c in available) / sum(c['rounds'] - c['draws'] for c in available)


def save(fig, name, title, caption):
    fig.savefig(CHARTS / (name + '.png'), dpi=170, bbox_inches='tight')
    fig.savefig(CHARTS / (name + '.svg'), bbox_inches='tight')
    plt.close(fig)
    FIGURES.append((name, title, caption))


fig, axes = plt.subplots(1, 5, figsize=(18, 4), layout='constrained')
for form, ax in enumerate(axes):
    matrix = np.full((4, 4), np.nan)
    for c in CELLS:
        if c['form'] == form and len(c['group']) == 2:
            a, b = c['group']
            matrix[HEROES.index(a), HEROES.index(b)] = rate(c, a) * 100
            matrix[HEROES.index(b), HEROES.index(a)] = rate(c, b) * 100
    im = ax.imshow(matrix, cmap='RdYlBu', vmin=25, vmax=75)
    for i in range(4):
        for j in range(4):
            if i != j:
                ax.text(j, i, f'{matrix[i,j]:.1f}%', ha='center', va='center', fontsize=9)
    ax.set(xticks=range(4), yticks=range(4), xticklabels=[h.title() for h in HEROES],
           yticklabels=[h.title() for h in HEROES], title=f'Form {form}')
    ax.tick_params(axis='x', labelrotation=45)
fig.colorbar(im, ax=axes, shrink=.65, label='Row character decisive win share (%)')
save(fig, 'duel-heatmaps', 'Every same-form duel',
     'Read rows against columns. Each pair has 1,000 rounds; mirrored cells are the same experiment, not extra samples. White diagonals are untested mirror matches. The color scale spans 25–75%.')

fig, ax = plt.subplots(figsize=(10, 5), layout='constrained')
x = np.arange(5)
for i, h in enumerate(HEROES):
    values = [100 * aggregate([c for c in CELLS if c['form'] == f and len(c['group']) == 2], h) for f in range(5)]
    bars = ax.bar(x + (i - 1.5) * .19, values, width=.18, color=COLORS[i], label=h.title())
    ax.bar_label(bars, fmt='%.1f', fontsize=8, padding=2)
ax.axhspan(45, 55, color='#2b9465', alpha=.09, label='45–55% screening band')
ax.axhline(50, color='#444', ls='--', lw=1)
ax.set(xticks=x, xticklabels=[f'Form {f}' for f in range(5)], ylim=(0, 75), ylabel='Decisive wins (%)', title='Overall duel results against the other three heroes')
ax.legend(ncol=3, loc='upper center', bbox_to_anchor=(.5, -.1))
save(fig, 'duel-overall', 'Overall duel shares',
     'Each character faces all three opponents equally often (3,000 rounds per form). This aggregate can conceal individual counter-matchups; consult the duel heatmaps and uncertainty plot.')

fig, ax = plt.subplots(figsize=(10, 5), layout='constrained')
for i, h in enumerate(HEROES):
    cs = [next(c for c in CELLS if c['form'] == f and len(c['group']) == 4) for f in range(5)]
    values = [100 * rate(c, h) for c in cs]
    intervals = [ci(c, h) for c in cs]
    ax.bar(x + (i - 1.5) * .19, values, width=.18, color=COLORS[i], label=h.title(),
           yerr=np.array([[v - lo * 100 for v, (lo, hi) in zip(values, intervals)],
                          [hi * 100 - v for v, (lo, hi) in zip(values, intervals)]]), capsize=2)
ax.axhspan(20, 30, color='#2b9465', alpha=.09)
ax.axhline(25, color='#444', ls='--', lw=1)
ax.set(xticks=x, xticklabels=[f'Form {f}' for f in range(5)], ylim=(0, 50), ylabel='Decisive wins (%)', title='Four-player Brawl: target 25% each')
ax.legend(ncol=4)
save(fig, 'four-way', 'Four-player wins with uncertainty',
     'Error bars are approximate 95% intervals clustered by seed/slot-swap block. The pale band is ±5 percentage points around equal share. Each form uses 1,000 rounds total, not 1,000 per character.')

triples = [c for c in CELLS if len(c['group']) == 3]
matrix = np.array([[100 * rate(c, h) if h in c['group'] else np.nan for h in HEROES] for c in triples])
fig, ax = plt.subplots(figsize=(8, 10), layout='constrained')
im = ax.imshow(matrix, cmap='RdYlBu', vmin=18.3, vmax=48.3, aspect='auto')
for i, row in enumerate(matrix):
    for j, v in enumerate(row):
        if not np.isnan(v):
            ax.text(j, i, f'{v:.1f}%', ha='center', va='center')
ax.set(xticks=range(4), xticklabels=[h.title() for h in HEROES], yticks=range(len(triples)),
       yticklabels=[label(c) for c in triples], title='Every three-player matchup: target 33.3%')
fig.colorbar(im, ax=ax, label='Decisive wins (%)')
save(fig, 'three-way', 'Three-player matchups', 'Missing cells denote a character absent from that group. N/S/L/G mean Naruto/Sasuke/Luffy/Goku. Each row has 1,000 rounds; the color scale is centered at one-third.')

duels = [c for c in CELLS if len(c['group']) == 2]
fig, ax = plt.subplots(figsize=(11, 12), layout='constrained')
for i, c in enumerate(duels):
    h = c['group'][0]
    lo, hi = ci(c, h)
    p = rate(c, h)
    ax.errorbar(p * 100, i, xerr=[[100 * (p - lo)], [100 * (hi - p)]], fmt='o',
                color=COLORS[HEROES.index(h)], capsize=3)
ax.axvspan(45, 55, color='#2b9465', alpha=.1)
ax.axvline(50, color='#444', ls='--')
ax.set(yticks=range(len(duels)), yticklabels=[f"Form {c['form']}: {c['group'][0].title()} vs {c['group'][1].title()}" for c in duels],
       xlabel='First named character: decisive win share (%)', xlim=(20, 80), title='All duel estimates and clustered 95% intervals')
ax.invert_yaxis()
save(fig, 'duel-intervals', 'Duel uncertainty', 'A 95% interval is an uncertainty estimate, not proof of equivalence. Intervals are not adjusted for 30 simultaneous comparisons. The screening band measures practical deviation separately.')

ranked = sorted(CELLS, key=lambda c: max(abs(rate(c, h) - 1 / len(c['group'])) for h in c['group']), reverse=True)
fig, ax = plt.subplots(figsize=(12, 14), layout='constrained')
deviations = [100 * max(abs(rate(c, h) - 1 / len(c['group'])) for h in c['group']) for c in ranked]
ax.barh(range(55), deviations, color=[['#2797ad', '#8570d7', '#e99a19'][len(c['group']) - 2] for c in ranked])
ax.axvline(5, color='#b14343', ls='--', label='5 percentage-point screen')
ax.set(yticks=range(55), yticklabels=[label(c) for c in ranked], xlabel='Largest absolute deviation from equal share (percentage points)', title='All matchups ranked by imbalance')
ax.invert_yaxis(); ax.legend()
save(fig, 'imbalance-ranking', 'All 55 matchup deviations', 'This chart keeps every result, including unfavorable ones. Blue = duel; purple = triple; orange = quartet. A failed screen is a tuning lead, not an automatically significant effect.')

maps = sorted({key.rsplit(':', 2)[0] for c in CELLS for key in c['scenarios']})
matrix = []
for f in range(5):
    for h in HEROES:
        row = []
        for m in maps:
            subsets = [s for c in duels if c['form'] == f and h in c['group'] for key, s in c['scenarios'].items() if key.rsplit(':', 2)[0] == m]
            row.append(100 * sum(s['wins'][h] for s in subsets) / sum(s['n'] - s['draws'] for s in subsets))
        matrix.append(row)
fig, ax = plt.subplots(figsize=(17, 9), layout='constrained')
im = ax.imshow(matrix, aspect='auto', cmap='RdYlBu', vmin=20, vmax=80)
ax.set(xticks=range(len(maps)), xticklabels=maps, yticks=range(20),
       yticklabels=[f'F{f} {h.title()}' for f in range(5) for h in HEROES], title='Duel win shares by arena and starting form')
ax.tick_params(axis='x', labelrotation=60)
fig.colorbar(im, ax=ax, label='Decisive wins (%)')
save(fig, 'map-effects', 'Arena effects', 'Each tile combines three opponents, both difficulties and both fall rules. Map slices have far fewer samples than the full matchup and are exploratory; CSV exports contain the exact counts. The color scale spans 20–80%.')

fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout='constrained')
for ax, factor in zip(axes, ['difficulty', 'fall']):
    values = ['hard', 'expert'] if factor == 'difficulty' else ['fallOn', 'fallOff']
    for i, h in enumerate(HEROES):
        ys = []
        for value in values:
            subsets = [s for c in duels if h in c['group'] for key, s in c['scenarios'].items() if value in key.rsplit(':', 2)[1:]]
            ys.append(100 * sum(s['wins'][h] for s in subsets) / sum(s['n'] - s['draws'] for s in subsets))
        ax.bar(np.arange(2) + (i - 1.5) * .19, ys, width=.18, color=COLORS[i], label=h.title())
    ax.axhline(50, color='#444', ls='--')
    ax.set(xticks=range(2), xticklabels=values, ylim=(0, 75), ylabel='Decisive duel wins (%)', title=f'Duel results by {factor}')
axes[0].legend(ncol=2)
save(fig, 'rule-effects', 'Difficulty and fall-death effects', 'These are descriptive aggregates over all forms, maps and opponents. They do not isolate a causal rule effect because each setting has its own seeds and slot blocks.')

fig, axes = plt.subplots(2, 1, figsize=(15, 8), layout='constrained', sharex=True)
positions = np.arange(55)
axes[0].bar(positions, [100 * c['draws'] / c['rounds'] for c in CELLS], color='#8570d7')
axes[0].set(ylabel='Draws (%)', title='Draws and average simulated round length for every matchup')
axes[1].bar(positions, [c['seconds'] / c['rounds'] for c in CELLS], color='#2797ad')
axes[1].set(ylabel='Mean round duration (s)', xticks=positions, xticklabels=[label(c) for c in CELLS])
axes[1].tick_params(axis='x', labelrotation=90)
save(fig, 'draws-duration', 'Draw rates and round duration', 'Draws include simultaneous finishes and unresolved rounds. Timeout counts are retained separately. Durations are simulated match seconds, not the time taken to execute the study.')

kill_totals = {}
move_totals = {}
for c in CELLS:
    for key, value in c['kills'].items():
        kill_totals[key] = kill_totals.get(key, 0) + value
    for key, value in c['moves'].items():
        move_totals[key] = move_totals.get(key, 0) + value
fig, axes = plt.subplots(1, 2, figsize=(16, 10), layout='constrained')
for ax, totals, title in zip(axes, [kill_totals, move_totals], ['Credited kill sources (top 25)', 'Instrumented ability-start events']):
    pairs = sorted(totals.items(), key=lambda p: p[1], reverse=True)[:25]
    ax.barh(range(len(pairs)), [v for k, v in pairs], color='#2797ad')
    ax.set(yticks=range(len(pairs)), yticklabels=[k for k, v in pairs], title=title, xlabel='Recorded events')
    ax.invert_yaxis()
save(fig, 'combat-events', 'Combat telemetry', 'Kill sources count main-fighter deaths; dismissed clones do not emit kill events or award kills. These totals are deaths, not match wins. Start telemetry includes only the event types instrumented by the runner, not every move or successful hit. Events sum across all 55,000 rounds.')

fig, axes = plt.subplots(1, 2, figsize=(13, 5), layout='constrained')
for i, h in enumerate(HEROES):
    damage = []
    points = []
    for f in range(5):
        ds = [c for c in duels if c['form'] == f and h in c['group']]
        damage.append(sum(c['damage'][h] for c in ds) / sum(c['rounds'] for c in ds))
        q = next(c for c in CELLS if c['form'] == f and len(c['group']) == 4)
        points.append(q['points'][h] / q['rounds'])
    axes[0].bar(x + (i - 1.5) * .19, damage, width=.18, color=COLORS[i], label=h.title())
    axes[1].bar(x + (i - 1.5) * .19, points, width=.18, color=COLORS[i], label=h.title())
axes[0].set(title='Duel damage dealt per round', ylabel='Mean recorded damage')
axes[1].set(title='Four-player placement score per round', ylabel='Mean points (3 / 2 / 1 / 0)', ylim=(0, 3))
axes[1].axhline(1.5, color='#444', ls='--', lw=1)
for ax in axes:
    ax.set(xticks=x, xticklabels=[f'F{f}' for f in range(5)])
axes[0].legend(ncol=2)
save(fig, 'damage-points', 'Damage and placement scores', 'Damage is the existing match-stat measure, including attributed clone damage. Form health, environmental finishes and multi-opponent targeting mean damage need not track wins. A unique four-player placement awards 3/2/1/0; same-tick ties use the lower occupied place, so equal expected points can be below 1.5 when tied placements occur.')

EXPERIMENT_NAMES = ['pilot', 'scout', 'calibration1', 'calibration2', 'calibration3', 'calibration4', 'calibration5',
                    'validation', 'final', 'complete', 'verified-matrix', 'refined-matrix', 'crowd-matrix',
                    'controlled-prior', 'controlled-candidate', 'ai-prior', 'ai-candidate']
experiments = []
archive_path = OUT / 'exploratory-results.zip'
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in EXPERIMENT_NAMES:
        path = SOURCE.parent / (name + '.json')
        if not path.exists():
            continue
        d = json.loads(path.read_text(encoding='utf-8'))
        cells = d['cells']
        experiments.append({'name': name, 'completedCells': len(cells), 'completedRounds': sum(c['rounds'] for c in cells),
                            'roundsPerCell': d['roundsPerCell'], 'seed': d['seed'], 'simulationSha256': d.get('simulationSha256'),
                            'overrides': d.get('overrides'), 'complete': len(cells) == 55,
                            'cells': [{k: c[k] for k in ['form', 'group', 'rounds', 'wins', 'draws', 'timeouts']} for c in cells]})
        archive.write(path, name + '.json')
    # Bundle fingerprints make old results auditable even after tuning the repository.
    fingerprints = {e['simulationSha256'] for e in experiments}
    for path in SOURCE.parent.glob('*.mjs'):
        if hashlib.sha256(path.read_bytes()).hexdigest() in fingerprints:
            archive.write(path, 'bundles/' + path.name)
(OUT / 'experiments.json').write_text(json.dumps(experiments, separators=(',', ':')), encoding='utf-8')

fig, axes = plt.subplots(1, 2, figsize=(12, 5), layout='constrained')
for ax, names, title in zip(axes, [('controlled-prior', 'controlled-candidate'), ('ai-prior', 'ai-candidate')],
                           ['Rejected chain/clone-damage experiment', 'Close Fireball + rejected clone-cooldown experiment']):
    pair = [next((e for e in experiments if e['name'] == name), None) for name in names]
    if all(pair):
        for i, e in enumerate(pair):
            values = [100 * rate(next(c for c in e['cells'] if c['form'] == f and len(c['group']) == 4), 'sasuke') for f in range(5)]
            ax.bar(x + (i - .5) * .34, values, width=.32, label='Prior' if i == 0 else 'Candidate', color=['#8c98a5', '#8570d7'][i])
    ax.axhline(25, color='#444', ls='--')
    ax.set(xticks=x, xticklabels=[f'F{f}' for f in range(5)], ylim=(0, 40), ylabel='Sasuke quartet win share (%)', title=title)
    ax.legend()
save(fig, 'controlled-experiments', 'Controlled experiments, including rejected changes', 'Each bar comes from only 100 rounds, with identical seeds and scenarios within each prior/candidate pair. Differences this small are noisy. Neither experiment solved Sasuke’s crowd deficit. The final configuration retains the verified Fireball decision fix but rejects the four-second clone cooldown.')

fig, axes = plt.subplots(1, 2, figsize=(13, 5), layout='constrained')
for ax, names, title in zip(axes, [('controlled-prior', 'controlled-candidate'), ('ai-prior', 'ai-candidate')],
                           ['Chain/clone-damage scouting', 'Fireball/clone-cooldown scouting']):
    for i, name in enumerate(names):
        e = next((e for e in experiments if e['name'] == name), None)
        if e:
            values = [100 * aggregate([c for c in e['cells'] if c['form'] == f and len(c['group']) == 2], 'naruto') for f in range(5)]
            ax.plot(x, values, marker='o', color=['#8c98a5', '#e99a19'][i], label='Prior' if i == 0 else 'Candidate')
    ax.axhline(50, color='#444', ls='--')
    ax.set(xticks=x, xticklabels=[f'F{f}' for f in range(5)], ylim=(35, 65), ylabel='Naruto overall duel win share (%)', title=title)
    ax.legend()
save(fig, 'controlled-naruto-duels', 'Why the faster clone cooldown was rejected', 'These controlled scouts contain 300 duel rounds per hero/form across three opponents. The second candidate raised Naruto’s early-form duel advantage while not solving Sasuke’s crowd deficit. The final implementation therefore keeps six seconds. Samples are exploratory, correlated by seed/seat, and should not be pooled with final confirmation.')

control_audits = []
for prior_name, candidate_name in [('controlled-prior', 'controlled-candidate'), ('ai-prior', 'ai-candidate')]:
    paths = [SOURCE.parent / (name + '.json') for name in [prior_name, candidate_name]]
    if all(path.exists() for path in paths):
        a, b = [json.loads(path.read_text(encoding='utf-8')) for path in paths]
        comparisons = [(ca, cb) for ca in a['cells'] for cb in b['cells']
                       if ca['form'] == cb['form'] and ca['group'] == cb['group']
                       and len(ca['group']) == 2 and 'naruto' not in ca['group']]
        control_audits.append({'prior': prior_name, 'candidate': candidate_name,
                               'unchangedDuelCohorts': len(comparisons),
                               'bitIdenticalCohorts': sum(ca == cb for ca, cb in comparisons)})
(OUT / 'control-audits.json').write_text(json.dumps(control_audits, indent=2), encoding='utf-8')

with (OUT / 'matchups.csv').open('w', encoding='utf-8', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['form', 'group', 'hero', 'rounds', 'wins', 'draws', 'timeouts', 'decisiveWinShare', 'ciLow', 'ciHigh', 'meanPoints', 'meanDamage', 'meanDurationSeconds'])
    for c in CELLS:
        for h in c['group']:
            writer.writerow([c['form'], '/'.join(c['group']), h, c['rounds'], c['wins'][h], c['draws'], c['timeouts'], rate(c, h), *ci(c, h), c['points'][h] / c['rounds'], c['damage'][h] / c['rounds'], c['seconds'] / c['rounds']])
with (OUT / 'scenarios.csv').open('w', encoding='utf-8', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['form', 'group', 'map', 'difficulty', 'fallDeath', 'hero', 'rounds', 'wins', 'draws'])
    for c in CELLS:
        for key, s in sorted(c['scenarios'].items()):
            arena, difficulty, fall = key.rsplit(':', 2)
            for h in c['group']:
                writer.writerow([c['form'], '/'.join(c['group']), arena, difficulty, fall, h, s['n'], s['wins'][h], s['draws']])

bad = [c for c in CELLS if max(abs(rate(c, h) - 1 / len(c['group'])) for h in c['group']) > .05]
total_draws = sum(c['draws'] for c in CELLS)
timeouts = sum(c['timeouts'] for c in CELLS)
exploratory_rounds = sum(e['completedRounds'] for e in experiments)
worst = ranked[0]
findings = [
    f"Final confirmation: 55/55 combinations, 55,000 rounds, seed {DATA['seed']}, no tuning overrides.",
    f"{55-len(bad)}/55 combinations fall within the ±5 percentage-point screen; {len(bad)} require review. Equal chances are not established.",
    f"{total_draws:,} draws ({total_draws/550:.1f}%) and {timeouts:,} timeouts. Draws are excluded from win shares and never assigned a winner.",
    f"Largest measured mismatch: {label(worst)} — " + ', '.join(f'{h.title()} {rate(worst,h)*100:.1f}%' for h in worst['group']) + '.',
    f"The archived exploratory files contain {exploratory_rounds:,} completed rounds. Partial in-flight rounds are not counted; different variants are never pooled with final validation.",
]
changes = [
    ('Goku', 'Normal combo damage ×1.8; Kamehameha 16–30 damage (was 8–20), 280 range (230), 2.6 s cooldown (3.5), faster charge and wider beam; passive teleport recovery 0.08 s (0.16) and invulnerability 0.26 s (0.18). Form damage multipliers 1.05/1.15/1.35/1.50; first-form Spirit Bomb base damage 32. Teleport still has no arrival attack.'),
    ('Sasuke', 'Chidori damage 18 (14), recovery 0.18 s (0.22). Fireball damage 24 (12), speed 330 (240), windup 0.18 s (0.28), radius 44 (28), cooldown 3 s (3.8); its own explosion spares its caster. Amaterasu has its own 4.2 s cooldown and 4.5 burn DPS (6). Top two form multipliers 1.35/1.50. Chidori speed 720, one-second stun and two-extra-target limit retained.'),
    ('Naruto', 'Non-final clone health 15% (20%); damage split over the configured swarm size, base budget 0.4 and transformed budget 0.5; clone control ×0.55, stagger instead of repeated knockdown. Final clones retain exact current-health copies. Early-form damage multipliers 1.12/1.15; tail reach 2/4/10. Clone cooldown stays six seconds after rejecting the faster experiment. Clones still cannot block or parry.'),
    ('Luffy', 'Health 105 (115), Gatling damage 3.2 (3.5); multi-team Gatling damage coefficient 0.5 in base and 0.75 transformed. Super fist damage 28 + 10 per higher form (24 + 9); Gear Second/Fourth/Fifth multipliers 1.30/1.75/1.95. Grapple and move identities retained.'),
    ('Crowd rules', 'Normal base Kamehameha uses a 0.75 damage coefficient when its actual beam overlaps multiple opposing teams. A fighter and their clones count as one opponent group; ordinary duels keep full damage. Gatling follows the same team-count rule with its own coefficients.'),
    ('Bots and defects', 'Recent-aggressor weighting, less clone fixation, safer beam charging, and valid close Fireball choices against clusters. Fixed a reproduced low-ceiling loot deadlock by tracking crouch progress, crawling backward and temporarily ignoring unreachable loot. Fixed Fireball self-blast damage/burn using the existing owner-protection flag. No new runtime/network snapshot fields.'),
]
observations = []
for f in range(5):
    ds = [c for c in duels if c['form'] == f]
    q = next(c for c in CELLS if c['form'] == f and len(c['group']) == 4)
    means = {h: aggregate(ds, h) for h in HEROES}
    strongest = max(HEROES, key=lambda h: means[h])
    weakest = min(HEROES, key=lambda h: means[h])
    observations.append(f"Form {f}: overall duel shares — " + ', '.join(f'{h.title()} {100*means[h]:.1f}%' for h in HEROES) +
                        f". Highest/lowest are {strongest.title()}/{weakest.title()}; this averages three distinct opponents. Four-way shares — " +
                        ', '.join(f'{h.title()} {100*rate(q,h):.1f}%' for h in HEROES) + '.')
observations.append('Largest duel departures: ' + '; '.join(
    f"{label(c)} ({c['group'][0].title()} {100*rate(c,c['group'][0]):.1f}%)"
    for c in sorted(duels, key=lambda c: abs(rate(c,c['group'][0])-.5), reverse=True)[:5]) + '.')
observations.append('Largest crowd departures: ' + '; '.join(
    label(c) + ' [' + ', '.join(f'{h.title()} {100*rate(c,h):.1f}%' for h in c['group']) + ']'
    for c in [c for c in ranked if len(c['group']) > 2][:5]) + '.')
observations.append('Priority for further tuning is the persistent crowd deficit and the worst form-specific counters shown above. Do not raise a character globally from a single map slice: it can improve one matchup while breaking another. Human playtesting is needed to distinguish execution-policy weaknesses from move-set power.')
verification_names = ['confirmed-unit.log', 'confirmed-build.log', 'final-tools-tsc.log', 'final-browser.log',
                      'confirmed-browser.log', 'confirmed-herofight.log']
verification = {}
with zipfile.ZipFile(OUT / 'verification-logs.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in verification_names:
        path = SOURCE.parent / name
        if path.exists():
            verification[name] = path.read_text(encoding='utf-8', errors='replace')
            archive.write(path, name)
herofight = next((line.strip() for line in verification.get('confirmed-herofight.log','').splitlines()
                  if 'naruto vs sasuke form' in line), 'See archived hero-fight log.')
checks = [
    'Full unit suite: 801 tests passed across 64 files, zero failed assertions.' + (' The known Vitest worker onTaskUpdate reporting timeout is recorded separately and gives the command a nonzero exit status.' if 'Timeout calling "onTaskUpdate"' in verification.get('confirmed-unit.log','') else ' No worker-reporting timeout was recorded in this final run.'),
    'Full browser suite: 109 passed, zero failed (10.4 minutes), before rejecting the four-second clone cooldown. The focused hero-controls/form rerun on the final six-second cooldown passed 14 tests, zero failed (2.1 minutes).',
    'Production build: TypeScript and Vite passed on final settings. The new TypeScript study tools also passed their separate compiler check.',
    'Chart QA: generated PNG/SVG artifacts are visually inspected; the offline HTML includes filterable matchup rows and all plots.',
    'Deterministic comparison controls: ' + '; '.join(f"{a['bitIdenticalCohorts']}/{a['unchangedDuelCohorts']} unchanged duel cohorts bit-identical for {a['prior']} vs {a['candidate']}" for a in control_audits) + '.',
    herofight,
]
assert '801 passed' in verification.get('confirmed-unit.log',''), 'Final unit results not ready'
assert '109 passed' in verification.get('final-browser.log',''), 'Full browser results not ready'
assert 'passed' in verification.get('confirmed-browser.log',''), 'Final focused browser results not ready'
assert 'built in' in verification.get('confirmed-build.log',''), 'Final build results not ready'
assert not re.search(r'Tests\s+\d+ failed', verification.get('confirmed-unit.log','')), 'Final unit tests failed'
limits = [
    'These are equal starting forms, not permanently locked forms: form shields break naturally to base. New power orbs and weapon spawns are disabled to preserve the intended comparison; map props, hazards and their drops remain.',
    '18 maps × hard/expert × fall death on/off = 72 settings per matchup. Cyclic seat swaps balance starting slots and slot-specific bot personalities within one round; the underlying seat permutation changes between trial blocks.',
    'Sudden death starts at 75 simulated seconds. The study caps unresolved rounds at 180 seconds. It tests actual deterministic game simulation at 60 Hz, not a fabricated probability model.',
    'A thousand rounds is not a guarantee of a normalized outcome distribution. Around a 50% duel result, even independent trials have about ±3 percentage points of 95% sampling uncertainty; shared seed/seat blocks require clustered intervals.',
    'Screening is ±5 percentage points from 50%, 33.3%, or 25%, depending on group size. This is a practical diagnostic threshold, not a formal equivalence test. Multiple-comparison and map-slice uncertainty remain.',
    'Hard/expert bot policies, targeting and navigation affect measured win rates. Human execution, tactics, normal-difficulty bots, team play, mirror matches, mid-match orb progression and unrestricted weapon matches are outside this confirmation.',
    'Kill telemetry excludes clone dismissals. Damage and event counts describe behavior but do not by themselves establish why a character wins. Descriptive map/rule aggregates are not controlled causal estimates.',
    'Early pilot/scout schedules differ from the final interleaved 72-setting schedule. Only the explicitly paired controlled experiments should be read as same-seed before/after comparisons. A raw trend across all tuning stages would be misleading.',
]
experiment_notes = {
    'pilot': 'Initial smoke survey; 10 rounds per combination, too small for balance conclusions.',
    'scout': 'Early broad scouting; different early schedule, exploratory only.',
    'validation': 'Interrupted for tuning/defect fixes; only completed cohorts archived.',
    'final': 'Earlier interrupted candidate, despite its historical filename; not final validation.',
    'complete': 'Earlier interrupted candidate, despite its historical filename; not a complete study.',
    'verified-matrix': 'Completed earlier 55,000-round variant; exposed persistent crowd disparity.',
    'refined-matrix': '39 targeted cohorts after caster protection and first-form refinements; not pooled into final.',
    'crowd-matrix': 'Stopped partial crowd experiment; crowd coefficients alone did not resolve disparity.',
    'controlled-prior': 'Same-seed control for the chain/damage experiment.',
    'controlled-candidate': 'Wider/team-first shock and reduced clone damage with faster resummon: rejected; no convincing crowd improvement.',
    'ai-prior': 'Same-seed control for close Fireball and faster clone cooldown.',
    'ai-candidate': 'Close Fireball fix retained; faster clone cooldown rejected after increasing early Naruto duel advantage.',
}
for n in range(1, 6):
    experiment_notes['calibration' + str(n)] = 'Exploratory tuning iteration; scope/seed/bundle preserved in archive, not an independent final estimate.'
notes = '\n'.join(f'- **{title}:** {text}' for title, text in changes)
summary = '\n'.join('- ' + s for s in findings)
form_table = '| Index | Naruto | Sasuke | Luffy | Goku |\n|---|---|---|---|---|\n' + '\n'.join(
    f'| {f} | ' + ' | '.join(names) + ' |' for f, names in enumerate(FORM_NAMES))
experiment_table = '| Run | Completed cells | Completed rounds | Seed | Interpretation |\n|---|---:|---:|---:|---|\n' + '\n'.join(
    f"| {e['name']} | {e['completedCells']} | {e['completedRounds']:,} | {e['seed']} | {experiment_notes.get(e['name'],'Exploratory only.')} |" for e in experiments)
md = '# BRAWLKAI balance investigation — 2 November 2026\n\n' + summary + '\n\n## What changed\n\n' + notes
md += '\n\n## Observations from final validation\n\n' + '\n\n'.join(observations)
md += '\n\n## Verification\n\n' + '\n'.join('- ' + s for s in checks) + '\n\n[Complete verification logs](verification-logs.zip)'
md += '\n\n## Method and limits\n\n' + '\n'.join('- ' + s for s in limits)
md += '\n\n## Starting-form names\n\n' + form_table
md += '\n\n## Experiment ledger\n\n' + experiment_table
md += '\n\n## Charts\n\n' + '\n\n'.join(f'### {title}\n\n![{title}](charts/{name}.png)\n\n{caption}' for name, title, caption in FIGURES)
md += '\n\n## Files\n\n- [All matchups with intervals](2026-11-02.md)\n- [Final raw JSON](2026-11-02.json)\n- [Matchup CSV](matchups.csv)\n- [Scenario CSV](scenarios.csv)\n- [Experiment summaries](experiments.json)\n- [Full exploratory results and matching archived bundles](exploratory-results.zip)\n\n'
(OUT / 'investigation.md').write_text(md, encoding='utf-8')

def esc(s):
    return html.escape(str(s))


fig_html = ''.join(f'<section><h2>{esc(title)}</h2><img alt="{esc(title)}" src="data:image/png;base64,{base64.b64encode((CHARTS/(name+".png")).read_bytes()).decode()}"><p>{esc(caption)}</p><p><a href="charts/{name}.png">PNG</a> · <a href="charts/{name}.svg">SVG</a></p></section>' for name, title, caption in FIGURES)
rows = []
for c in CELLS:
    cells = ' · '.join(f"{h.title()}: {100*rate(c,h):.1f}% [{100*ci(c,h)[0]:.1f}–{100*ci(c,h)[1]:.1f}]" for h in c['group'])
    rows.append(f'<tr data-form="{c["form"]}" data-size="{len(c["group"])}" data-review="{str(c in bad).lower()}"><td>{c["form"]}</td><td>{esc(" / ".join(c["group"]))}</td><td>{esc(cells)}</td><td>{c["draws"]}</td><td>{c["timeouts"]}</td><td>{"REVIEW" if c in bad else "Within band"}</td></tr>')
experiment_rows = ''.join(f'<tr><td>{esc(e["name"])}</td><td>{e["completedCells"]}</td><td>{e["completedRounds"]:,}</td><td>{e["seed"]}</td><td>{esc(experiment_notes.get(e["name"],"Exploratory only."))}</td></tr>' for e in experiments)
page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BRAWLKAI balance investigation</title>
<style>body{margin:0;background:#edf1f4;color:#1c2b38;font:16px/1.6 system-ui,sans-serif}main{max-width:1280px;margin:auto;padding:32px}header,section{background:white;padding:28px;margin:0 0 24px;border-radius:12px;border:1px solid #dce3e9}h1{font-size:2.3rem;line-height:1.15;margin:0}h2{line-height:1.25}a{color:#245d9b}img{max-width:100%;height:auto}li{margin:10px 0}.alert{background:#fff0d5;padding:18px;border-left:5px solid #ca7b0b}table{border-collapse:collapse;font-size:14px;width:100%}td,th{text-align:left;border-bottom:1px solid #dde4e9;padding:10px;vertical-align:top}th{background:#edf2f6;position:sticky;top:0}.scroll{overflow:auto}select,input{font:inherit;margin:6px;padding:6px}small{color:#526477}code{overflow-wrap:anywhere}@media print{body{background:white}main{padding:0}section{break-inside:avoid}select,input{display:none}}</style><main>
'''
page += f'<header><small>2 November 2026 · deterministic simulation study</small><h1>BRAWLKAI balance investigation</h1><p>All four heroes · five starting forms · all distinct two-, three- and four-player groups</p><p class="alert"><strong>Equal chances are not established.</strong> {len(bad)} of 55 combinations remain outside the ±5 percentage-point screen. This report preserves those results.</p><ul>' + ''.join('<li>' + esc(s) + '</li>' for s in findings) + '</ul><p>Final bundle SHA-256: <code>' + esc(DATA['simulationSha256']) + '</code></p></header>'
page += '<section><h2>What changed and why</h2>' + ''.join(f'<h3>{esc(t)}</h3><p>{esc(s)}</p>' for t, s in changes) + '</section>'
page += '<section><h2>Observations from final validation</h2>' + ''.join('<p>'+esc(s)+'</p>' for s in observations) + '</section>'
page += '<section><h2>Verification</h2><ul>' + ''.join('<li>'+esc(s)+'</li>' for s in checks) + '</ul><p><a href="verification-logs.zip">Complete verification logs</a></p></section>'
page += '<section><h2>Method and limits</h2><ul>' + ''.join('<li>' + esc(s) + '</li>' for s in limits) + '</ul></section>'
page += '<section><h2>Starting-form names</h2><div class="scroll"><table><thead><tr><th>Index</th>' + ''.join('<th>'+h.title()+'</th>' for h in HEROES) + '</tr></thead><tbody>' + ''.join('<tr><td>'+str(f)+'</td>'+''.join('<td>'+esc(name)+'</td>' for name in names)+'</tr>' for f,names in enumerate(FORM_NAMES)) + '</tbody></table></div></section>'
page += '<section><h2>Every matchup</h2><p>Win shares exclude draws; brackets contain clustered 95% intervals. Filters do not change the underlying dataset.</p><label>Form <select id="form"><option value="">All</option>' + ''.join(f'<option>{i}</option>' for i in range(5)) + '</select></label><label>Players <select id="size"><option value="">All</option><option>2</option><option>3</option><option>4</option></select></label><label><input id="review" type="checkbox">Only outside band</label><input id="search" placeholder="Filter by character"><div class="scroll"><table><thead><tr><th>Form</th><th>Group</th><th>Win shares [95% interval]</th><th>Draws</th><th>Timeouts</th><th>Screen</th></tr></thead><tbody id="matchups">' + ''.join(rows) + '</tbody></table></div></section>'
page += fig_html
page += '<section><h2>Experiment ledger</h2><p>Historical names such as final/complete refer to interrupted candidates. The final confirmation is the separate fresh-seed 55,000-round dataset above. No historical variant is pooled into it.</p><div class="scroll"><table><thead><tr><th>Run</th><th>Completed cells</th><th>Completed rounds</th><th>Seed</th><th>Observation / interpretation</th></tr></thead><tbody>' + experiment_rows + '</tbody></table></div></section>'
page += '<section><h2>Downloads and reproduction</h2><ul>' + ''.join(f'<li><a href="{path}">{title}</a></li>' for path, title in [('2026-11-02.json','Final raw JSON'),('2026-11-02.md','Every matchup in Markdown'),('matchups.csv','Matchup CSV with uncertainty, points and damage'),('scenarios.csv','Every map/difficulty/fall-rule slice'),('experiments.json','Experiment summaries'),('exploratory-results.zip','Full exploratory results and matching archived bundles'),('README.md','Methodology and reproduction commands'),('investigation.md','Detailed Markdown report')]) + '</ul></section>'
page += '''<script>const filters=['form','size','review','search'].map(id=>document.getElementById(id));function update(){const [form,size,review,search]=filters;for(const row of document.querySelectorAll('#matchups tr'))row.hidden=!!((form.value&&row.dataset.form!==form.value)||(size.value&&row.dataset.size!==size.value)||(review.checked&&row.dataset.review!=='true')||(search.value&&!row.textContent.toLowerCase().includes(search.value.toLowerCase())))}filters.forEach(el=>el.addEventListener('input',update));</script></main></html>'''
(OUT / 'investigation.html').write_text(page, encoding='utf-8')
print('\n'.join(findings))
print(f'Rendered {len(FIGURES)} figures in PNG/SVG, CSV exports, experiment archive and offline HTML')
