// ============================================================
// BLOOD & BAYONETS — Force Builder App
// ============================================================

const App = (() => {
  // ─── STATE ────────────────────────────────────────────────
  let State = {
    factionId: 'british_army',
    pointsLimit: 250,
    commanderId: null,
    commanderOptions: {}, // keyed by optionText -> bool
    units: [], // [{ uid, unitId, qty, cannonType, isVeteran, upgrades:{officer,musician,standard} }]
    nextUid: 1,
  };

  function faction() { return FACTIONS[State.factionId]; }

  // ─── COMPUTED ─────────────────────────────────────────────
  function commanderCost() {
    if (!State.commanderId) return 0;
    const f = faction();
    const cmd = f.commanders.find(c => c.id === State.commanderId);
    if (!cmd) return 0;
    let pts = cmd.pts;
    // Mount option
    if (State.commanderOptions['Mount Commander (+4 pts)']) pts += 4;
    if (State.commanderOptions['Upgrade to Veteran (+4 pts)']) pts += 4;
    return pts;
  }

  function unitData(u) {
    const f = faction();
    return [...(f.core||[]), ...(f.support||[])].find(d => d.id === u.unitId);
  }

  function unitCost(u) {
    const d = unitData(u);
    if (!d) return 0;
    let pts = 0;
    if (d.isArtillery) {
      pts = d.costPerCrew; // base = 4 crew
      // cannon upgrade
      if (!d.isHowitzer && !d.isRocket && u.cannonType) {
        pts += (CANNON_TYPES[u.cannonType]?.pts || 0);
      }
    } else {
      pts = d.costPerModel * u.qty;
      // upgrades (each is double model cost)
      const upgCost = d.costPerModel * 2;
      if (u.upgrades.officer) pts += upgCost;
      if (u.upgrades.musician) pts += upgCost;
      if (u.upgrades.standard) pts += upgCost;
    }
    // veteran
    if (u.isVeteran && d.vetCost) {
      if (d.isArtillery) pts += d.vetCost;
      else pts += d.vetCost * u.qty;
    }
    return pts;
  }

  function totalCost() {
    return commanderCost() + State.units.reduce((s, u) => s + unitCost(u), 0);
  }

  function coreCount() {
    const f = faction();
    const coreIds = new Set((f.core||[]).map(d => d.id));
    return State.units.filter(u => coreIds.has(u.unitId)).length;
  }
  function supportCount() {
    const f = faction();
    const suppIds = new Set((f.support||[]).map(d => d.id));
    return State.units.filter(u => suppIds.has(u.unitId)).length;
  }
  function maxSupport() { return Math.floor(coreCount() / 2); }

  // ─── VALIDATION ───────────────────────────────────────────
  function validate() {
    const msgs = [];
    if (!State.commanderId) msgs.push('No Commander selected.');
    const total = totalCost();
    if (total > State.pointsLimit) msgs.push(`Over points limit by ${total - State.pointsLimit} pts.`);
    const sup = supportCount(), maxSup = maxSupport();
    if (sup > maxSup) msgs.push(`Too many Support units (${sup}). For ${coreCount()} Core units you may take ${maxSup}.`);
    if (coreCount() === 0 && State.commanderId) msgs.push('Must include at least 1 Core unit.');
    // size checks
    State.units.forEach(u => {
      const d = unitData(u);
      if (!d || d.isArtillery) return;
      if (u.qty < d.minSize) msgs.push(`${d.name}: minimum ${d.minSize} models (currently ${u.qty}).`);
      if (u.qty > d.maxSize) msgs.push(`${d.name}: maximum ${d.maxSize} models (currently ${u.qty}).`);
    });
    return msgs;
  }

  // ─── MUTATIONS ────────────────────────────────────────────
  function setFaction(id) {
    State.factionId = id;
    State.commanderId = null;
    State.commanderOptions = {};
    State.units = [];
    render();
  }
  function setPointsLimit(v) { State.pointsLimit = Math.max(50, parseInt(v)||250); render(); }
  function setCommander(id) {
    State.commanderId = id;
    State.commanderOptions = {};
    render();
  }
  function toggleCommanderOption(opt) {
    State.commanderOptions[opt] = !State.commanderOptions[opt];
    render();
  }
  function addUnit(unitId) {
    const f = faction();
    const d = [...(f.core||[]), ...(f.support||[])].find(x => x.id === unitId);
    if (!d) return;
    State.units.push({
      uid: State.nextUid++,
      unitId,
      qty: d.minSize || 1,
      cannonType: d.cannonUpgrades ? d.cannonUpgrades[0] : null,
      isVeteran: false,
      upgrades: { officer: false, musician: false, standard: false },
    });
    render();
  }
  function removeUnit(uid) {
    State.units = State.units.filter(u => u.uid !== uid);
    render();
  }
  function changeQty(uid, delta) {
    const u = State.units.find(x => x.uid === uid);
    if (!u) return;
    const d = unitData(u);
    if (!d || d.isArtillery) return;
    u.qty = Math.max(d.minSize || 1, Math.min(d.maxSize || 99, u.qty + delta));
    render();
  }
  function setCannonType(uid, type) {
    const u = State.units.find(x => x.uid === uid);
    if (u) { u.cannonType = type; render(); }
  }
  function toggleVeteran(uid) {
    const u = State.units.find(x => x.uid === uid);
    if (!u) return;
    const d = unitData(u);
    if (d && d.vetCost) { u.isVeteran = !u.isVeteran; render(); }
  }
  function toggleUpgrade(uid, key) {
    const u = State.units.find(x => x.uid === uid);
    if (u) { u.upgrades[key] = !u.upgrades[key]; render(); }
  }

  // ─── MODAL ────────────────────────────────────────────────
  let _modalType = null;
  function openModal(type) {
    _modalType = type;
    renderModal();
    document.getElementById('unit-modal').classList.add('open');
  }
  function closeModal() {
    document.getElementById('unit-modal').classList.remove('open');
    _modalType = null;
  }

  function renderModal() {
    const f = faction();
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    titleEl.textContent = _modalType === 'core' ? '— Add Core Unit —' : '— Add Support Unit —';

    const units = _modalType === 'core' ? (f.core||[]) : (f.support||[]);
    if (units.length === 0) {
      bodyEl.innerHTML = '<p style="padding:16px;color:var(--text-light);font-style:italic;grid-column:1/-1">No units available.</p>';
      return;
    }

    bodyEl.innerHTML = units.map(d => {
      const costLabel = d.isArtillery
        ? `${d.costPerCrew} pts (crew)`
        : `${d.costPerModel} pts/model`;
      const statsLine = d.isArtillery
        ? `${d.shoot} Shoot · ${d.melee} Melee · Resolve ${d.resolve} · ${d.experience}`
        : `${d.shoot} Shoot · ${d.melee} Melee · Resolve ${d.resolve} · ${d.experience} · ${d.minSize}–${d.maxSize} models`;
      const cls = _modalType === 'support' ? 'support-unit' : 'core-unit';
      return `
        <button class="unit-select-btn ${cls}" onclick="App.addUnitAndClose('${d.id}')">
          <span class="usb-name">${d.name}</span>
          <span class="usb-cost">${costLabel}</span>
          <span class="usb-stats">${statsLine}</span>
          ${d.special?.length ? `<span class="usb-stats" style="margin-top:2px;font-style:italic">${d.special.join(' · ')}</span>` : ''}
          ${d.equipment?.length ? `<span class="usb-stats">${d.equipment.join(', ')}</span>` : ''}
        </button>
      `;
    }).join('');
  }

  function addUnitAndClose(id) {
    addUnit(id);
    closeModal();
  }

  // ─── RENDER SIDEBAR ───────────────────────────────────────
  function renderSidebar() {
    // faction select
    const fSelect = document.getElementById('faction-select');
    if (fSelect) {
      const val = fSelect.value;
      if (!val) {
        fSelect.innerHTML = Object.values(FACTIONS).map(f =>
          `<option value="${f.id}">${f.name}</option>`
        ).join('');
      }
      fSelect.value = State.factionId;
    }

    // points limit
    const plInput = document.getElementById('points-limit');
    if (plInput) plInput.value = State.pointsLimit;

    // points bar
    const total = totalCost();
    const pct = Math.min(100, (total / State.pointsLimit) * 100);
    const over = total > State.pointsLimit;
    const fill = document.getElementById('fp-fill');
    const nums = document.getElementById('fp-numbers');
    if (fill) { fill.style.width = pct + '%'; fill.classList.toggle('over', over); }
    if (nums) { nums.textContent = `${total} / ${State.pointsLimit} pts`; nums.classList.toggle('over', over); }

    // Commander select
    const f = faction();
    const cmdSel = document.getElementById('commander-select');
    if (cmdSel) {
      cmdSel.innerHTML = '<option value="">— Select Commander —</option>' +
        f.commanders.map(c => `<option value="${c.id}">${c.name} (${c.pts} pts)</option>`).join('');
      cmdSel.value = State.commanderId || '';
    }

    // faction rules
    const rulesBox = document.getElementById('faction-rules-content');
    if (rulesBox) {
      if (f.forceRules?.length) {
        rulesBox.innerHTML = `
          <div class="faction-info-text" style="margin-bottom:6px;font-style:italic">${f.description || ''}</div>
          <ul>${f.forceRules.map(r => `<li>${r}</li>`).join('')}</ul>
          ${f.allies?.length ? `<div class="faction-info-text" style="margin-top:8px;font-weight:600">Allies:</div><ul>${f.allies.map(a=>`<li>${a}</li>`).join('')}</ul>` : ''}
        `;
      } else {
        rulesBox.innerHTML = '<em style="color:var(--text-light);font-size:0.88em">Select a faction above.</em>';
      }
    }

    // support availability
    const suppNote = document.getElementById('support-note');
    if (suppNote) {
      const max = maxSupport();
      const cur = supportCount();
      suppNote.textContent = `${cur}/${max} Support slots (1 per 2 Core)`;
      suppNote.style.color = cur > max ? 'var(--crimson)' : 'var(--text-light)';
    }

    // point guidance
    const pgEl = document.getElementById('point-guidance');
    if (pgEl) {
      pgEl.innerHTML = POINT_GUIDANCE.map(g =>
        `<div style="display:flex;justify-content:space-between;font-size:0.82em;padding:2px 0;border-bottom:1px solid var(--border-faint)">
          <span style="color:var(--text-mid)">${g.label}</span>
          <span style="font-family:var(--font-title);color:var(--blue-empire)">${g.pts}</span>
        </div>`
      ).join('');
    }
  }

  // ─── RENDER MAIN PANEL ────────────────────────────────────
  function renderMain() {
    const f = faction();
    const el = document.getElementById('roster-panel');
    let html = '';

    // Validation
    const errors = validate();
    if (errors.length) {
      html += `<div class="validation-box">
        <div class="v-title">⚠ Force Issues</div>
        <ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>
      </div>`;
    }

    // Commander
    html += renderCommanderSection();

    // Core units
    const coreUnits = State.units.filter(u => f.core?.some(d => d.id === u.unitId));
    html += `<div class="section-header">
      <span class="section-title">Core Units</span>
      <hr class="section-hr">
      <button class="section-add-btn" onclick="App.openModal('core')">+ Add Unit</button>
    </div>`;
    if (coreUnits.length === 0) {
      html += `<div class="empty-state"><span class="em-icon">⚔</span>No core units added yet. Every force needs at least one.</div>`;
    } else {
      html += coreUnits.map(u => renderUnitRow(u, 'core')).join('');
    }

    // Support units
    const suppUnits = State.units.filter(u => f.support?.some(d => d.id === u.unitId));
    const maxSup = maxSupport();
    const supOver = suppUnits.length > maxSup;
    html += `<div class="section-header" style="margin-top:20px">
      <span class="section-title">Support Units</span>
      <hr class="section-hr">
      <span class="section-note" style="color:${supOver ? 'var(--crimson)' : 'var(--text-light)'};font-size:0.8em;white-space:nowrap">${suppUnits.length}/${maxSup}</span>
      <button class="section-add-btn" onclick="App.openModal('support')">+ Add Unit</button>
    </div>`;
    if (suppUnits.length === 0) {
      html += `<div class="empty-state"><span class="em-icon">🏇</span>Add support units — 1 per every 2 core units.</div>`;
    } else {
      html += suppUnits.map(u => renderUnitRow(u, 'support')).join('');
    }

    // Export bar
    html += `<div class="export-bar" style="margin-top:20px">
      <button class="export-btn primary" onclick="App.exportTXT()">📋 Export Text</button>
      <button class="export-btn secondary" onclick="App.exportPDF()">📄 Print / PDF</button>
      <button class="export-btn secondary" onclick="App.clearForce()" style="margin-left:auto;color:var(--crimson);border-color:var(--crimson)">🗑 Clear Force</button>
    </div>`;

    el.innerHTML = html;
  }

  function renderCommanderSection() {
    const f = faction();
    if (!State.commanderId) {
      return `<div class="section-header">
        <span class="section-title">Commander</span>
        <hr class="section-hr">
      </div>
      <div class="empty-state"><span class="em-icon">⚜</span>Select a Commander in the sidebar to begin your force.</div>`;
    }
    const cmd = f.commanders.find(c => c.id === State.commanderId);
    if (!cmd) return '';
    const cost = commanderCost();
    let html = `<div class="section-header"><span class="section-title">Commander</span><hr class="section-hr"></div>
    <div class="commander-card">
      <div class="commander-header">
        <span class="commander-name">${cmd.name}</span>
        <span class="commander-cost-badge">${cost} pts</span>
      </div>
      <div class="commander-stats">
        <div class="stat-box"><span class="stat-label">Shoot</span><span class="stat-value">${cmd.shoot||'—'}</span></div>
        <div class="stat-box"><span class="stat-label">Melee</span><span class="stat-value">${cmd.melee||'—'}</span></div>
        <div class="stat-box"><span class="stat-label">Resolve</span><span class="stat-value">${cmd.resolve||'—'}</span></div>
        <div class="stat-box"><span class="stat-label">Cmd Range</span><span class="stat-value">${cmd.cmdRange}"</span></div>
        <div class="stat-box"><span class="stat-label">Cmd Pts</span><span class="stat-value">${cmd.cmdPts}</span></div>
      </div>`;
    // composition
    html += `<div style="font-size:0.82em;color:var(--text-light);margin-bottom:6px">
      <strong style="color:var(--text-mid)">Composition:</strong> ${cmd.composition}
    </div>`;
    // experience
    html += `<div class="commander-attrs">
      <span class="stat-chip">${cmd.experience||'Trained'}</span>
    </div>`;
    // special rules
    if (cmd.special?.length) {
      html += `<div class="commander-special">${cmd.special.map(s => `<span class="rule-tag" data-tooltip="${SPECIAL_RULES_GLOSSARY[s]||s}">${s}</span>`).join('')}</div>`;
    }
    // options
    if (cmd.options?.length && !cmd.isAttachment) {
      html += `<div class="commander-options">`;
      cmd.options.forEach(opt => {
        const active = State.commanderOptions[opt] || false;
        html += `<button class="toggle-btn ${active?'active':''}" onclick="App.toggleCommanderOption('${opt.replace(/'/g,"\\'")}')">${opt}</button>`;
      });
      html += `</div>`;
    }
    if (cmd.isNamed && cmd.isAttachment) {
      html += `<div class="commander-desc">Attaches to: ${cmd.attachTo}</div>`;
    }
    html += `</div>`;
    return html;
  }

  function renderUnitRow(u, typeClass) {
    const d = unitData(u);
    if (!d) return '';
    const cost = unitCost(u);
    let html = `<div class="unit-row">
      <div class="unit-row-header">
        <span class="unit-name">${d.name}</span>
        <span class="unit-type-badge ${typeClass}">${typeClass}</span>
        <span class="unit-cost-badge">${cost} pts</span>
        <button class="unit-remove-btn" onclick="App.removeUnit(${u.uid})" title="Remove unit">✕</button>
      </div>
      <div class="unit-row-body">`;

    // Stats
    html += `<div class="unit-stats-mini">
      <span class="stat-chip">${d.shoot||'—'} Shoot</span>
      <span class="stat-chip">${d.melee||'—'} Melee</span>
      <span class="stat-chip">Res ${d.resolve}</span>
      <span class="stat-chip">${d.experience}</span>
      ${d.isArtillery ? `<span class="stat-chip">${d.composition||''}</span>` : `<span class="stat-chip">${u.qty} models</span>`}
    </div>`;

    // Equipment
    if (d.equipment?.length) {
      html += `<div class="special-rules-row">${d.equipment.map(e => `<span class="rule-tag" data-tooltip="${WEAPON_GLOSSARY[e]||e}">${e}</span>`).join('')}</div>`;
    }

    // Special rules
    if (d.special?.length) {
      html += `<div class="special-rules-row">${d.special.map(s => `<span class="rule-tag" data-tooltip="${SPECIAL_RULES_GLOSSARY[s]||s}">${s}</span>`).join('')}</div>`;
    }

    // Formations
    if (d.formations?.length) {
      html += `<div style="font-size:0.78em;color:var(--text-light);font-style:italic">Formations: ${d.formations.join(', ')}</div>`;
    }

    // Qty stepper (non-artillery)
    if (!d.isArtillery) {
      html += `<div class="unit-qty-row">
        <span class="qty-label">Models (${d.minSize}–${d.maxSize}):</span>
        <div class="qty-stepper">
          <button onclick="App.changeQty(${u.uid}, -1)">−</button>
          <span class="qty-display">${u.qty}</span>
          <button onclick="App.changeQty(${u.uid}, +1)">+</button>
        </div>
      </div>`;
    }

    // Cannon type selector
    if (!d.isHowitzer && !d.isRocket && d.cannonUpgrades?.length) {
      html += `<div class="unit-qty-row">
        <span class="qty-label">Cannon:</span>
        <select onchange="App.setCannonType(${u.uid}, this.value)" style="width:auto">
          ${d.cannonUpgrades.map(t => `<option value="${t}" ${u.cannonType===t?'selected':''}>${CANNON_TYPES[t].name} (+${CANNON_TYPES[t].pts} pts)</option>`).join('')}
        </select>
      </div>`;
    }

    // Upgrades
    const upgradeOptions = [];
    if (d.upgrades) {
      if (d.upgrades.includes('Officer/N.C.O.') || d.upgrades?.includes('Officer/N.C.O.'))
        upgradeOptions.push({ key:'officer', label:`Officer/N.C.O. (+${d.costPerModel*2} pts)` });
      if (d.upgrades?.includes('Musician'))
        upgradeOptions.push({ key:'musician', label:`Musician (+${d.costPerModel*2} pts)` });
      if (d.upgrades?.includes('Standard Bearer'))
        upgradeOptions.push({ key:'standard', label:`Standard Bearer (+${d.costPerModel*2} pts)` });
    }

    if (upgradeOptions.length || d.vetCost) {
      html += `<div class="upgrades-row">`;
      upgradeOptions.forEach(opt => {
        html += `<button class="toggle-btn ${u.upgrades[opt.key]?'active':''}" onclick="App.toggleUpgrade(${u.uid},'${opt.key}')">${opt.label}</button>`;
      });
      if (d.vetCost) {
        const vetLabel = d.isArtillery ? `Veteran (+${d.vetCost} pts)` : `Veteran (+${d.vetCost} pt/model)`;
        html += `<button class="toggle-btn ${u.isVeteran?'active':''}" onclick="App.toggleVeteran(${u.uid})">${vetLabel}</button>`;
      }
      html += `</div>`;
    }

    if (d.trainedUpgrade) {
      html += `<div style="font-size:0.78em;color:var(--blue-empire);font-style:italic;padding-top:2px">Upgrade: ${d.trainedUpgrade}</div>`;
    }
    if (d.notes) {
      html += `<div style="font-size:0.78em;color:var(--text-light);font-style:italic">${d.notes}</div>`;
    }

    html += `</div></div>`;
    return html;
  }

  // ─── EXPORT ───────────────────────────────────────────────
  function exportTXT() {
    const f = faction();
    const cmd = f.commanders.find(c => c.id === State.commanderId);
    let out = `BLOOD & BAYONETS — FORCE ROSTER\n`;
    out += `${'='.repeat(50)}\n`;
    out += `Faction: ${f.name}\n`;
    out += `Points: ${totalCost()} / ${State.pointsLimit}\n`;
    out += `Date: ${new Date().toLocaleDateString()}\n\n`;

    out += `COMMANDER: ${cmd?.name||'None'} [${commanderCost()} pts]\n`;
    if (cmd) {
      out += `  ${cmd.experience} · Shoot ${cmd.shoot} · Melee ${cmd.melee} · Resolve ${cmd.resolve}\n`;
      out += `  Command ${cmd.cmdRange}" / ${cmd.cmdPts} pts\n`;
      out += `  ${cmd.composition}\n`;
      const opts = Object.keys(State.commanderOptions).filter(k => State.commanderOptions[k]);
      if (opts.length) out += `  Options: ${opts.join(', ')}\n`;
    }
    out += '\n';

    const coreUnits = State.units.filter(u => f.core?.some(d => d.id === u.unitId));
    const suppUnits = State.units.filter(u => f.support?.some(d => d.id === u.unitId));

    out += `CORE UNITS (${coreUnits.length})\n${'-'.repeat(40)}\n`;
    coreUnits.forEach(u => {
      const d = unitData(u);
      if (!d) return;
      out += `${d.name} [${unitCost(u)} pts]\n`;
      if (d.isArtillery) out += `  Crew · ${d.experience} · ${d.composition}\n`;
      else out += `  ${u.qty} models · ${d.experience} · Shoot ${d.shoot} · Melee ${d.melee}\n`;
      if (u.isVeteran) out += `  + Veteran\n`;
      const ups = [u.upgrades.officer?'Officer/N.C.O.':'',u.upgrades.musician?'Musician':'',u.upgrades.standard?'Standard Bearer':''].filter(Boolean);
      if (ups.length) out += `  Upgrades: ${ups.join(', ')}\n`;
      out += '\n';
    });

    out += `\nSUPPORT UNITS (${suppUnits.length})\n${'-'.repeat(40)}\n`;
    suppUnits.forEach(u => {
      const d = unitData(u);
      if (!d) return;
      out += `${d.name} [${unitCost(u)} pts]\n`;
      if (d.isArtillery) out += `  Crew · ${d.experience} · ${d.composition}`;
      else out += `  ${u.qty} models · ${d.experience} · Shoot ${d.shoot} · Melee ${d.melee}`;
      if (!d.isHowitzer && !d.isRocket && u.cannonType) out += ` · ${CANNON_TYPES[u.cannonType].name}`;
      out += '\n';
      if (u.isVeteran) out += `  + Veteran\n`;
      const ups = [u.upgrades.officer?'Officer/N.C.O.':'',u.upgrades.musician?'Musician':'',u.upgrades.standard?'Standard Bearer':''].filter(Boolean);
      if (ups.length) out += `  Upgrades: ${ups.join(', ')}\n`;
      out += '\n';
    });

    out += `${'='.repeat(50)}\nTOTAL: ${totalCost()} pts\n`;

    const blob = new Blob([out], {type:'text/plain'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blood-bayonets-force.txt`;
    a.click();
  }

  function exportPDF() {
    const f = faction();
    const cmd = f.commanders.find(c => c.id === State.commanderId);
    const coreUnits = State.units.filter(u => f.core?.some(d => d.id === u.unitId));
    const suppUnits = State.units.filter(u => f.support?.some(d => d.id === u.unitId));

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Blood &amp; Bayonets — Force Roster</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
      body { font-family: 'Crimson Text', serif; max-width: 700px; margin: 0 auto; padding: 24px; color: #1a1208; background: #fff; }
      h1 { font-family: 'Cinzel', serif; font-size: 2em; letter-spacing: 4px; text-transform: uppercase; color: #1a3a6b; border-bottom: 3px solid #c8963e; padding-bottom: 8px; margin-bottom: 4px; }
      .subtitle { font-family: 'Cinzel', serif; font-size: 0.82em; letter-spacing: 4px; text-transform: uppercase; color: #8b6914; margin-bottom: 16px; }
      .meta { display: flex; gap: 20px; background: #f0e8d0; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; font-size: 0.9em; }
      .meta span { color: #1a3a6b; font-weight: 600; }
      h2 { font-family: 'Cinzel', serif; font-size: 0.9em; letter-spacing: 3px; text-transform: uppercase; color: #1a3a6b; border-bottom: 1px solid #c8963e; padding-bottom: 4px; margin: 16px 0 8px; }
      .unit-block { border: 1px solid #c8a84060; border-radius: 3px; padding: 8px 12px; margin-bottom: 6px; }
      .unit-head { display: flex; justify-content: space-between; font-family: 'Cinzel', serif; font-size: 0.88em; color: #0d1f3c; font-weight: 700; margin-bottom: 3px; }
      .unit-body { font-size: 0.85em; color: #6b5035; }
      .special { color: #8b6914; font-style: italic; }
      @media print { body { max-width: 100%; } }
    </style></head><body>
    <h1>Blood &amp; Bayonets</h1>
    <div class="subtitle">Force Roster — ${f.name}</div>
    <div class="meta">
      <div>Points: <span>${totalCost()} / ${State.pointsLimit}</span></div>
      <div>Core: <span>${coreUnits.length}</span></div>
      <div>Support: <span>${suppUnits.length}</span></div>
      <div>Date: <span>${new Date().toLocaleDateString()}</span></div>
    </div>`);

    // Commander
    w.document.write(`<h2>Commander</h2>`);
    if (cmd) {
      w.document.write(`<div class="unit-block">
        <div class="unit-head"><span>${cmd.name}</span><span>${commanderCost()} pts</span></div>
        <div class="unit-body">${cmd.experience} · Shoot ${cmd.shoot} · Melee ${cmd.melee} · Resolve ${cmd.resolve} · Cmd ${cmd.cmdRange}" / ${cmd.cmdPts} pts<br>
        ${cmd.composition}</div>
        ${cmd.special?.length ? `<div class="special">${cmd.special.join(' · ')}</div>` : ''}
      </div>`);
    }

    // Core
    w.document.write(`<h2>Core Units (${coreUnits.length})</h2>`);
    coreUnits.forEach(u => {
      const d = unitData(u);
      if (!d) return;
      const ups = [u.upgrades.officer?'Officer/N.C.O.':'',u.upgrades.musician?'Musician':'',u.upgrades.standard?'Standard Bearer':''].filter(Boolean);
      w.document.write(`<div class="unit-block">
        <div class="unit-head"><span>${d.name}${u.isVeteran?' ★':''}</span><span>${unitCost(u)} pts</span></div>
        <div class="unit-body">${d.isArtillery ? d.composition : `${u.qty} models`} · ${d.experience} · Shoot ${d.shoot} · Melee ${d.melee} · Resolve ${d.resolve}</div>
        ${ups.length ? `<div class="unit-body">Upgrades: ${ups.join(', ')}</div>` : ''}
        ${d.special?.length ? `<div class="special">${d.special.join(' · ')}</div>` : ''}
      </div>`);
    });

    // Support
    w.document.write(`<h2>Support Units (${suppUnits.length})</h2>`);
    suppUnits.forEach(u => {
      const d = unitData(u);
      if (!d) return;
      const ups = [u.upgrades.officer?'Officer/N.C.O.':'',u.upgrades.musician?'Musician':'',u.upgrades.standard?'Standard Bearer':''].filter(Boolean);
      const cannonStr = !d.isHowitzer && !d.isRocket && u.cannonType ? ` · ${CANNON_TYPES[u.cannonType].name}` : '';
      w.document.write(`<div class="unit-block">
        <div class="unit-head"><span>${d.name}${u.isVeteran?' ★':''}</span><span>${unitCost(u)} pts</span></div>
        <div class="unit-body">${d.isArtillery ? d.composition : `${u.qty} models`} · ${d.experience} · Shoot ${d.shoot} · Melee ${d.melee}${cannonStr}</div>
        ${ups.length ? `<div class="unit-body">Upgrades: ${ups.join(', ')}</div>` : ''}
        ${d.special?.length ? `<div class="special">${d.special.join(' · ')}</div>` : ''}
      </div>`);
    });

    w.document.write(`<div style="border-top:2px solid #c8963e;margin-top:20px;padding-top:8px;font-family:'Cinzel',serif;text-align:right;color:#1a3a6b">
      TOTAL: ${totalCost()} / ${State.pointsLimit} pts
    </div>
    <div style="text-align:center;font-size:0.75em;color:#8b6914;margin-top:16px;font-style:italic">
      "Victory belongs to the most persevering." — Napoléon Bonaparte
    </div>
    </body></html>`);
    w.document.close();
    w.print();
  }

  function clearForce() {
    if (!confirm('Clear the entire force?')) return;
    State.commanderId = null;
    State.commanderOptions = {};
    State.units = [];
    render();
  }

  // ─── RENDER ───────────────────────────────────────────────
  function render() {
    renderSidebar();
    renderMain();
  }

  // ─── INIT ─────────────────────────────────────────────────
  function init() {
    // Faction select
    const fSelect = document.getElementById('faction-select');
    if (fSelect) {
      fSelect.innerHTML = Object.values(FACTIONS).map(f =>
        `<option value="${f.id}">${f.name}</option>`
      ).join('');
      fSelect.value = State.factionId;
      fSelect.addEventListener('change', () => setFaction(fSelect.value));
    }

    // Points limit
    const plInput = document.getElementById('points-limit');
    if (plInput) {
      plInput.value = State.pointsLimit;
      plInput.addEventListener('change', () => setPointsLimit(plInput.value));
    }

    // Commander select
    const cmdSel = document.getElementById('commander-select');
    if (cmdSel) {
      cmdSel.addEventListener('change', () => setCommander(cmdSel.value||null));
    }

    // Modal close
    document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('unit-modal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('unit-modal')) closeModal();
    });

    render();
  }

  // Expose public API
  return {
    init,
    openModal,
    closeModal,
    addUnitAndClose,
    removeUnit,
    changeQty,
    setCannonType,
    toggleVeteran,
    toggleUpgrade,
    toggleCommanderOption,
    exportTXT,
    exportPDF,
    clearForce,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
