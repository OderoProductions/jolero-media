/* Jolero client gallery: the Edit tab, for portal admins only.

   gallery.js loads this, with the portal's auth.js, only when this browser
   is signed into the portal; then it asks the portal who you are, and only
   an admin gets the Edit button. Every change goes through the gallery
   worker, which checks the sign-in again, so editing this file in a
   browser gets nobody anywhere.

   Editing happens on the gallery page itself:
     · the title, the note to the client, which client it belongs to,
       whether downloads are open, how long the link lasts
     · every photo and video, folder by folder: drag to reorder or into
       another folder, tap to select, then delete, move or make a cover
     · folder names and folder order
     · adding files: Add files on a folder, or drop them onto it from the
       desktop. They upload straight away (gallery-upload.js) but only
       join the gallery on Save; Cancel deletes them again
     · a video's heading ("Highlight videos", "Social edits") from the
       selection bar
   Nothing is saved until Save. Deleted files are removed from R2 then,
   and Download all needs no rebuilding: the worker builds it on the fly. */
(() => {
  "use strict";

  const G = window.JoleroGallery;
  if (!G || !window.PortalAuth || !PortalAuth.configured() || !window.SUPABASE_CONFIG) return;
  const SB = window.SUPABASE_CONFIG;
  const FILE_RE = /^[tpov]\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;
  const GRACE_DAYS = 90; // the worker sweeps files this long after a link expires
  const CRC_MAX = 512 * 1024 * 1024; // work out a missing CRC here for files up to this size

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const icon = (d) => {
    const ns = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(ns, "svg");
    s.setAttribute("class", "icon");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    s.appendChild(p);
    return s;
  };
  const ICON = {
    pen: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
    grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
    up: "M12 19V5m0 0-6 6m6-6 6 6",
    down: "M12 5v14m0 0-6-6m6 6 6-6",
    star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z",
    play: "M8 5.5v13l11-6.5z",
    check: "M5 12.5l4.5 4.5L19 7.5",
  };
  const clock = (sec) => {
    sec = Math.round(sec || 0);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  };
  const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- talking to the worker and the portal ---------- */

  async function token() {
    const t = await PortalAuth.getToken();
    if (!t) throw new Error("You've been signed out of the portal. Sign in again, then retry.");
    return t;
  }

  async function api(method, path, body, headers) {
    const res = await fetch(G.api + path, {
      method,
      headers: { authorization: `Bearer ${await token()}`, ...(headers || {}) },
      body,
      referrerPolicy: "no-referrer",
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) throw new Error("The gallery service didn't accept your sign-in. Sign out of the portal and back in, then retry.");
      let detail = text;
      try { detail = JSON.parse(text).error || text; } catch (e) { /* plain text */ }
      throw new Error(`Couldn't save (${res.status}: ${detail}).`);
    }
    return { body: text ? JSON.parse(text) : null, res };
  }

  async function getManifest() {
    const { body, res } = await api("GET", `/admin/o/g/${G.id}/manifest.json`);
    let meta = {};
    try { meta = JSON.parse(res.headers.get("x-custom-metadata") || "{}"); } catch (e) { /* none */ }
    // the object's metadata is what the worker enforces, so it wins
    if (meta.expires !== undefined) body.expires = meta.expires;
    if (meta.locked !== undefined) body.locked = meta.locked === "1";
    if (meta.keep !== undefined) body.keep = meta.keep === "1";
    return body;
  }

  async function putManifest(man) {
    await api("PUT", `/admin/o/g/${G.id}/manifest.json`, JSON.stringify(man), {
      "content-type": "application/json; charset=utf-8",
      "x-meta-expires": man.expires || "",
      "x-meta-locked": man.locked ? "1" : "0",
      "x-meta-keep": man.keep ? "1" : "0",
      "x-meta-title": encodeURIComponent(man.title || ""),
    });
  }

  // The portal's clients, straight from Supabase (admins can read them all)
  async function sb(path, init) {
    init = init || {};
    const res = await fetch(`${SB.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: SB.anonKey,
        authorization: `Bearer ${await token()}`,
        accept: "application/json",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`The portal said no (${res.status}).`);
    return res.json();
  }
  const getClients = () => sb("clients?select=id,name,contact_name&order=name.asc");
  async function addClient(name, contact) {
    const rows = await sb("clients", {
      method: "POST",
      headers: { "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ name, contact_name: contact || name }),
    });
    return rows[0];
  }

  /* CRC-32 of an original, read from R2 in pieces. Download all is built on
     the fly from each file's size and CRC (see the worker); older galleries
     only had CRCs for the files inside their stored zips. */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  async function crcOf(key) {
    const res = await fetch(`${G.api}/admin/o/g/${G.id}/${key}`, {
      headers: { authorization: `Bearer ${await token()}` },
      referrerPolicy: "no-referrer",
    });
    if (!res.ok || !res.body) throw new Error(`Couldn't read ${key} (${res.status}).`);
    const reader = res.body.getReader();
    let crc = 0xFFFFFFFF;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i++) crc = CRC_TABLE[(crc ^ value[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- the Edit button: admins only ---------- */

  let editBtn = null;
  (async () => {
    let profile = null;
    try { profile = await PortalAuth.getProfile(); } catch (e) { return; }
    if (!profile || profile.role !== "admin") return;
    editBtn = el("button", "btn btn-ghost btn-sm edit-tab");
    editBtn.type = "button";
    editBtn.appendChild(icon(ICON.pen));
    editBtn.appendChild(el("span", null, "Edit"));
    editBtn.setAttribute("aria-label", "Edit this gallery");
    editBtn.addEventListener("click", open);
    const actions = document.querySelector(".bar-actions");
    actions.insertBefore(editBtn, actions.firstChild);
    if (/[?&]edit\b/.test(location.search)) open();
  })();

  window.JoleroGalleryAdmin = { refresh() { /* the button outlives re-renders */ } };

  /* ---------- editor state ---------- */

  let original = null;      // the manifest as loaded
  let groups = [];          // [{id|null, name, cover, zip, items: [item]}]
  let galleryCover = "";    // thumbnail key fronting the gallery (the client's portal card)
  let removed = [];         // items marked for deletion
  let selected = new Set(); // items
  let lastClicked = null;
  let clients = [];
  let dirty = false;
  let uploaded = [];        // keys this edit has written to R2 (for Cancel to clean up)
  let busy = false;         // an upload is running
  let ed = null;            // the editor's root element
  let fields = {};          // title, note, client select, ...

  function buildGroups(man) {
    const items = Array.isArray(man.items) ? man.items : [];
    const folders = Array.isArray(man.folders) ? man.folders : [];
    const known = new Set(folders.map((f) => f.id));
    const out = [];
    const loose = items.filter((it) => !known.has(it.f));
    if (loose.length || !folders.length) out.push({ id: null, name: "", cover: "", zip: man.zip || null, items: loose });
    for (const f of folders) {
      out.push({ id: f.id, name: f.name || "Folder", cover: f.cover || "", zip: f.zip || null, items: items.filter((it) => it.f === f.id) });
    }
    return out;
  }

  function nextFolderId() {
    let max = 0;
    for (const g of groups) { const m = /^f(\d+)$/.exec(g.id || ""); if (m) max = Math.max(max, +m[1]); }
    for (const f of original.folders || []) { const m = /^f(\d+)$/.exec(f.id || ""); if (m) max = Math.max(max, +m[1]); }
    return `f${max + 1}`;
  }

  function changed() {
    dirty = true;
    status();
  }

  /* ---------- open / close ---------- */

  async function open() {
    if (ed) return;
    editBtn.disabled = true;
    editBtn.lastChild.textContent = "Opening…";
    try {
      let man = await getManifest();
      // Older galleries keep their file CRCs only inside their stored zips:
      // copy them onto the items first, so Download all keeps working after edits
      const needCrc = (man.items || []).some((it) => !Number.isInteger(it.crc));
      const hasZip = man.zip || (man.folders || []).some((f) => f.zip);
      if (needCrc && hasZip) {
        await api("POST", `/admin/g/${G.id}/crc`);
        man = await getManifest();
      }
      // Anything still without one (a loose file no zip ever held): work it
      // out from the original and save it straight away, so Download all
      // can include it even if this edit is cancelled
      const missing = (man.items || []).filter((it) => !Number.isInteger(it.crc) &&
        FILE_RE.test(it.o || "") && Number.isInteger(it.bytes) && it.bytes <= CRC_MAX);
      if (missing.length) {
        for (let n = 0; n < missing.length; n++) {
          editBtn.lastChild.textContent = `Checking files ${n + 1}/${missing.length}…`;
          missing[n].crc = await crcOf(missing[n].o);
        }
        await putManifest(man);
      }
      original = man;
      groups = buildGroups(clone(man));
      galleryCover = man.cover || "";
      removed = [];
      selected = new Set();
      uploaded = [];
      dirty = false;
      try { clients = await getClients(); } catch (e) { clients = null; }
      render();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      editBtn.disabled = false;
      editBtn.lastChild.textContent = "Edit";
    }
  }

  function close() {
    if (!ed) return;
    ed.remove();
    ed = null;
    document.body.classList.remove("is-editing");
    editBtn.hidden = false;
    window.scrollTo(0, 0);
  }

  window.addEventListener("beforeunload", (e) => {
    if (ed && dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- rendering ---------- */

  function render() {
    const first = !ed;
    if (first) {
      ed = el("div", "ed");
      ed.id = "editor";
      document.querySelector(".bar").after(ed);
      document.body.classList.add("is-editing");
      editBtn.hidden = true;
      ed.appendChild(renderBar());
      ed.appendChild(renderIntro());
      const host = el("div", "wrap ed-groups");
      host.id = "ed-groups";
      ed.appendChild(host);
      ed.appendChild(renderSelBar());
      wireDrag(host);
      window.scrollTo(0, 0);
    }
    renderGroups();
    status();
  }

  function renderBar() {
    const bar = el("div", "ed-bar");
    const inner = el("div", "wrap ed-bar-inner");
    const label = el("p", "ed-bar-label");
    label.appendChild(el("b", null, "Editing"));
    const st = el("span", "ed-status");
    st.id = "ed-status";
    label.appendChild(st);
    inner.appendChild(label);
    const prog = el("div", "ed-progress");
    prog.id = "ed-progress";
    prog.hidden = true;
    prog.appendChild(el("span", "ed-progress-text"));
    const track = el("span", "ed-progress-track");
    track.appendChild(el("span", "ed-progress-fill"));
    prog.appendChild(track);
    inner.appendChild(prog);
    const actions = el("div", "ed-bar-actions");
    const cancel = el("button", "btn btn-ghost btn-sm", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", async () => {
      if (busy && !confirm("A file is still uploading. Stop and leave without saving?")) return;
      if (!busy && dirty && !confirm("Leave without saving? Your changes will be lost.")) return;
      await discardUploads();
      close();
    });
    const save = el("button", "btn btn-primary btn-sm", "Save changes");
    save.type = "button";
    save.id = "ed-save";
    save.addEventListener("click", saveAll);
    actions.append(cancel, save);
    inner.appendChild(actions);
    bar.appendChild(inner);
    return bar;
  }

  function status() {
    const st = $("ed-status");
    if (!st) return;
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    const parts = [plural(count, "file")];
    if (removed.length) parts.push(`${removed.length} to delete`);
    parts.push(busy ? "uploading" : dirty ? "unsaved changes" : "no changes yet");
    st.textContent = parts.join("  ·  ");
    $("ed-save").disabled = !dirty || busy;
  }

  function labelled(text, control, hint) {
    const wrap = el("label", "ed-field");
    wrap.appendChild(el("span", "ed-label", text));
    wrap.appendChild(control);
    if (hint) wrap.appendChild(el("span", "ed-hint", hint));
    return wrap;
  }

  function renderIntro() {
    const sec = el("section", "wrap");
    const box = el("div", "intro frame ed-intro");

    const title = el("input", "ed-title");
    title.type = "text";
    title.maxLength = 120;
    title.value = original.title || "";
    title.placeholder = "Gallery title";
    title.setAttribute("aria-label", "Gallery title");
    title.addEventListener("input", changed);

    const note = el("textarea", "field ed-note");
    note.rows = 4;
    note.maxLength = 4000;
    note.value = original.message || "";
    note.placeholder = "A note for the client, shown under the title. Optional.";
    note.addEventListener("input", () => { autosize(note); changed(); });

    const grid = el("div", "ed-settings");

    // client
    const client = el("select", "field ed-select");
    const newName = el("input", "field");
    newName.type = "text";
    newName.maxLength = 120;
    newName.placeholder = "Client or business name, e.g. Coach Manowar";
    const newContact = el("input", "field");
    newContact.type = "text";
    newContact.maxLength = 120;
    newContact.placeholder = "Contact name (optional), e.g. André Roberto";
    const newBox = el("div", "ed-newclient");
    newBox.append(labelled("New client", newName), labelled("Contact", newContact,
      "You can add their email later on the portal's Clients page."));
    fillClients(client, newName, newBox);
    client.addEventListener("change", () => {
      newBox.hidden = client.value !== "__new";
      if (!newBox.hidden) newName.focus();
      changed();
    });
    newName.addEventListener("input", changed);
    newContact.addEventListener("input", changed);

    // downloads
    const locked = el("select", "field ed-select");
    for (const [v, t] of [["0", "Open"], ["1", "Held until paid"]]) {
      const o = el("option", null, t);
      o.value = v;
      locked.appendChild(o);
    }
    locked.value = original.locked ? "1" : "0";
    locked.addEventListener("change", changed);
    const lockedHint = el("span", "ed-hint");
    const lockText = () => (locked.value === "1"
      ? "They can view everything, but downloads stay off until you open them."
      : "They can view and download everything.");
    lockedHint.textContent = lockText();
    locked.addEventListener("change", () => { lockedHint.textContent = lockText(); });

    // expiry
    const until = el("input", "field");
    until.type = "date";
    until.value = original.expires ? String(original.expires).slice(0, 10) : "";
    const untilHint = el("span", "ed-hint");
    const keep = el("input");
    keep.type = "checkbox";
    keep.checked = !!original.keep;
    const keepRow = el("label", "check ed-check");
    keepRow.append(keep, el("span", null, "Keep the files after the link expires (for our own use)"));
    const hintText = () => {
      if (!until.value) return "No end date: the link keeps working until you set one.";
      const gone = new Date(`${until.value}T12:00:00Z`);
      gone.setUTCDate(gone.getUTCDate() + GRACE_DAYS);
      return keep.checked ? "The link stops working after this day. Files are kept."
        : `The link stops working after this day. Files are deleted around ${gone.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`;
    };
    untilHint.textContent = hintText();
    until.addEventListener("change", () => { untilHint.textContent = hintText(); changed(); });
    keep.addEventListener("change", () => { untilHint.textContent = hintText(); changed(); });
    const untilWrap = labelled("Link available until", until);
    untilWrap.appendChild(untilHint);

    const clientCol = el("div", "ed-field");
    const clientLabel = el("label", "ed-label", "Client");
    clientLabel.htmlFor = client.id = "ed-client";
    clientCol.append(clientLabel, client, newBox);
    const lockedWrap = labelled("Downloads", locked);
    lockedWrap.appendChild(lockedHint);
    grid.append(clientCol, lockedWrap, untilWrap);
    box.append(
      el("p", "ed-kicker", "Title"), title,
      el("p", "ed-kicker", "Note to the client"), note,
      grid, keepRow,
    );
    sec.appendChild(box);
    fields = { title, note, client, newName, newContact, locked, until, keep };
    requestAnimationFrame(() => autosize(note));
    return sec;
  }

  function autosize(t) {
    t.style.height = "auto";
    t.style.height = `${Math.max(t.scrollHeight + 2, 120)}px`;
  }

  function fillClients(select, newName, newBox) {
    select.textContent = "";
    const none = el("option", null, "No client yet");
    none.value = "";
    select.appendChild(none);
    let match = false;
    for (const c of clients || []) {
      const o = el("option", null, c.contact_name && c.contact_name !== c.name ? `${c.name} (${c.contact_name})` : c.name);
      o.value = c.id;
      if (c.id === original.clientId) { o.selected = true; match = true; }
      select.appendChild(o);
    }
    const add = el("option", null, "+ New client…");
    add.value = "__new";
    select.appendChild(add);
    if (clients === null) {
      // couldn't reach the portal: keep whatever it was
      const keepIt = el("option", null, original.client || "(unchanged)");
      keepIt.value = "__keep";
      keepIt.selected = true;
      select.insertBefore(keepIt, select.firstChild);
    } else if (!match && original.client) {
      // an older gallery with just a typed name: offer to make it a client
      add.selected = true;
      newName.value = original.client;
    }
    newBox.hidden = select.value !== "__new";
  }

  function renderSelBar() {
    const bar = el("div", "ed-sel");
    bar.id = "ed-sel";
    bar.hidden = true;
    const inner = el("div", "wrap ed-sel-inner");
    const count = el("span", "ed-sel-count");
    count.id = "ed-sel-count";
    const move = el("select", "field ed-select ed-move");
    move.id = "ed-move";
    move.setAttribute("aria-label", "Move the selected files to");
    move.addEventListener("change", () => {
      const v = move.value;
      move.value = "";
      if (v) moveSelected(v);
    });
    const gcover = el("button", "btn btn-ghost btn-sm", "Gallery cover");
    gcover.type = "button";
    gcover.id = "ed-gcover";
    gcover.title = "The photo on this gallery's card in the client's portal";
    gcover.addEventListener("click", makeGalleryCover);
    const cover = el("button", "btn btn-ghost btn-sm", "Folder cover");
    cover.type = "button";
    cover.id = "ed-cover";
    cover.addEventListener("click", makeCover);
    const head = el("select", "field ed-select ed-move");
    head.id = "ed-head";
    head.setAttribute("aria-label", "Heading for the selected videos");
    head.addEventListener("change", () => {
      const v = head.value;
      head.value = "";
      if (v) setHeading(v);
    });
    const del = el("button", "btn btn-sm ed-delete", "Delete");
    del.type = "button";
    del.id = "ed-del";
    del.addEventListener("click", deleteSelected);
    const clear = el("button", "btn btn-ghost btn-sm", "Clear");
    clear.type = "button";
    clear.addEventListener("click", () => { selected.clear(); paintSelection(); });
    inner.append(count, move, head, gcover, cover, del, clear);
    bar.appendChild(inner);
    return bar;
  }

  function groupTitle(g) {
    if (g.id) return g.name;
    return groups.some((x) => x.id) ? "Not in a folder" : "Photos and videos";
  }

  function renderGroups() {
    const host = $("ed-groups");
    host.textContent = "";
    const folderGroups = groups.filter((g) => g.id);
    groups.forEach((g, gi) => {
      const sec = el("section", "ed-group");
      sec.dataset.g = String(gi);
      const head = el("div", "ed-ghead");
      if (g.id) {
        const name = el("input", "ed-gname");
        name.type = "text";
        name.maxLength = 80;
        name.value = g.name;
        name.setAttribute("aria-label", "Folder name");
        name.addEventListener("input", () => { g.name = name.value; changed(); });
        name.addEventListener("blur", () => { if (!name.value.trim()) { name.value = g.name = "Folder"; changed(); } });
        head.appendChild(name);
      } else {
        head.appendChild(el("h2", "ed-gtitle", groupTitle(g)));
      }
      head.appendChild(el("span", "ed-gcount", g.items.length ? plural(g.items.length, "file") : "Empty: removed when you save"));
      const tools = el("div", "ed-gtools");
      if (window.JoleroUpload) {
        const pick = el("input");
        pick.type = "file";
        pick.multiple = true;
        pick.hidden = true;
        pick.addEventListener("change", () => { const f = [...pick.files]; pick.value = ""; addFiles(g, f); });
        const add = el("button", "ed-link ed-add", "+ Add files");
        add.type = "button";
        add.disabled = busy;
        add.addEventListener("click", () => pick.click());
        tools.append(pick, add);
      }
      if (g.items.length) {
        const all = el("button", "ed-link", "Select all");
        all.type = "button";
        all.addEventListener("click", () => {
          const every = g.items.every((it) => selected.has(it));
          for (const it of g.items) every ? selected.delete(it) : selected.add(it);
          paintSelection();
        });
        tools.appendChild(all);
      }
      if (g.id && folderGroups.length > 1) {
        const fi = folderGroups.indexOf(g);
        for (const [dir, d, label] of [[-1, ICON.up, "Move folder up"], [1, ICON.down, "Move folder down"]]) {
          const b = el("button", "ed-iconbtn");
          b.type = "button";
          b.setAttribute("aria-label", label);
          b.appendChild(icon(d));
          b.disabled = (dir < 0 && fi === 0) || (dir > 0 && fi === folderGroups.length - 1);
          b.addEventListener("click", () => moveFolder(g, dir));
          tools.appendChild(b);
        }
      }
      head.appendChild(tools);
      sec.appendChild(head);

      const grid = el("div", "ed-grid");
      grid.dataset.g = String(gi);
      if (!g.items.length) grid.appendChild(el("p", "ed-empty", window.JoleroUpload ? "Drag files here, or drop them in from your computer" : "Drag files here"));
      wireFileDrop(grid, g);
      g.items.forEach((it, i) => grid.appendChild(tile(it, g, i)));
      sec.appendChild(grid);
      host.appendChild(sec);
    });
    paintSelection();
  }

  function tile(it, g, i) {
    const t = el("div", "ed-tile");
    t.dataset.i = String(i);
    t.tabIndex = 0;
    t.setAttribute("role", "button");
    t.setAttribute("aria-label", `${it.name || "File"}. Select. Alt and the arrow keys move it.`);
    if (it.t && G.url(it.t)) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.draggable = false;
      img.src = G.url(it.t);
      t.appendChild(img);
    } else {
      const f = el("span", "ed-filebox");
      f.appendChild(el("b", null, ((it.name || "").match(/\.([a-z0-9]{1,6})$/i) || ["", "file"])[1].toUpperCase()));
      f.appendChild(el("span", null, it.name || "File"));
      t.appendChild(f);
    }
    if (it.type === "video") {
      const v = el("span", "ed-badge");
      v.appendChild(icon(ICON.play));
      v.appendChild(document.createTextNode(clock(it.dur)));
      t.appendChild(v);
    }
    const isGallery = it.t && galleryCover === it.t;
    if (isGallery || (g.id && it.t && g.cover === it.t)) {
      const c = el("span", "ed-cover-badge");
      c.appendChild(icon(ICON.star));
      c.appendChild(document.createTextNode(isGallery ? "Gallery cover" : "Cover"));
      t.appendChild(c);
    }
    const tick = el("span", "ed-tick");
    tick.appendChild(icon(ICON.check));
    t.appendChild(tick);
    const grip = el("span", "ed-handle");
    grip.setAttribute("aria-hidden", "true");
    grip.appendChild(icon(ICON.grip));
    t.appendChild(grip);
    t.appendChild(el("span", "ed-name", it.name || ""));
    if (it.type === "video" && it.g) t.appendChild(el("span", "ed-vhead", it.g));
    return t;
  }

  function itemAt(tileEl) {
    const g = groups[Number(tileEl.closest(".ed-grid").dataset.g)];
    return { g, it: g.items[Number(tileEl.dataset.i)], i: Number(tileEl.dataset.i) };
  }

  function paintSelection() {
    for (const t of document.querySelectorAll(".ed-tile")) {
      const { it } = itemAt(t);
      const on = selected.has(it);
      t.classList.toggle("is-selected", on);
      t.setAttribute("aria-pressed", String(on));
    }
    const n = selected.size;
    $("ed-sel").hidden = !n;
    document.body.classList.toggle("has-selection", n > 0);
    if (!n) return;
    $("ed-sel-count").textContent = `${n} selected`;
    const move = $("ed-move");
    move.textContent = "";
    const head = el("option", null, "Move to…");
    head.value = "";
    move.appendChild(head);
    groups.forEach((g, gi) => {
      if (!g.id && !groups.some((x) => x.id)) return;
      const o = el("option", null, groupTitle(g));
      o.value = String(gi);
      move.appendChild(o);
    });
    if (!groups.some((g) => !g.id)) {
      const o = el("option", null, "Not in a folder");
      o.value = "root";
      move.appendChild(o);
    }
    const nf = el("option", null, "New folder…");
    nf.value = "new";
    move.appendChild(nf);
    const only = n === 1 ? [...selected][0] : null;
    const home = only && groups.find((g) => g.items.includes(only));
    $("ed-cover").hidden = !(only && home && home.id && only.t);
    $("ed-gcover").hidden = !(only && only.t);

    // headings group videos on the client's page ("Highlight videos", "Social edits")
    const vids = [...selected].filter((it) => it.type === "video");
    const hs = $("ed-head");
    hs.hidden = !vids.length;
    hs.textContent = "";
    const first = el("option", null, "Video heading…");
    first.value = "";
    hs.appendChild(first);
    for (const h of headings()) {
      const o = el("option", null, h);
      o.value = `h:${h}`;
      hs.appendChild(o);
    }
    const nh = el("option", null, "New heading…");
    nh.value = "new";
    hs.appendChild(nh);
    const none = el("option", null, "No heading");
    none.value = "none";
    hs.appendChild(none);
  }

  function headings() {
    const seen = [];
    for (const g of groups) for (const it of g.items) {
      const h = (it.type === "video" && it.g || "").trim();
      if (h && !seen.some((x) => x.toLowerCase() === h.toLowerCase())) seen.push(h);
    }
    return seen;
  }

  function setHeading(v) {
    let label = "";
    if (v === "new") {
      label = (prompt("Heading for these videos, e.g. Social edits") || "").trim().slice(0, 60);
      if (!label) return;
    } else if (v.startsWith("h:")) {
      label = v.slice(2);
    }
    for (const it of selected) {
      if (it.type !== "video") continue;
      if (label) it.g = label; else delete it.g;
    }
    changed();
    renderGroups();
  }

  /* ---------- adding files ---------- */

  function setProgress(text, fraction) {
    const p = $("ed-progress");
    if (!p) return;
    p.hidden = text == null;
    if (text == null) return;
    p.querySelector(".ed-progress-text").textContent = text;
    p.querySelector(".ed-progress-fill").style.width = `${Math.round(Math.min(Math.max(fraction || 0, 0), 1) * 100)}%`;
  }

  // the next free number for a file's keys (o/0007-name.jpg, t/0007.jpg)
  function nextNumber() {
    const all = (original.items || []).concat(groups.flatMap((g) => g.items), removed);
    return 1 + all.reduce((m, it) => {
      const x = /^[ov]\/(\d+)-/.exec(it.o || "");
      return x ? Math.max(m, +x[1]) : m;
    }, all.length);
  }

  async function addFiles(g, list) {
    const files = [...list].filter((f) => f.size > 0 && !f.name.startsWith("."));
    if (!files.length || busy) return;
    busy = true;
    status();
    renderGroups();
    const batch = [];
    setProgress("Starting…", 0);
    try {
      const items = await JoleroUpload.upload({
        api: G.api,
        getToken: token,
        gid: G.id,
        files,
        start: nextNumber(),
        progress: setProgress,
        written: (k) => { batch.push(k); uploaded.push(k); },
      });
      g.items.push(...items);
      selected = new Set(items);
      changed();
      const vids = items.filter((it) => it.type === "video").length;
      flash(`${plural(items.length, "file")} added. Save to show ${items.length === 1 ? "it" : "them"} to the client`
        + (vids && headings().length ? ", and pick a video heading below." : "."));
    } catch (err) {
      // nothing half-uploaded is left behind
      const keys = batch.filter((k) => FILE_RE.test(k));
      if (keys.length) {
        try { await api("POST", `/admin/g/${G.id}/delete`, JSON.stringify({ files: keys }), { "content-type": "application/json" }); } catch (e) { /* best effort */ }
        uploaded = uploaded.filter((k) => !keys.includes(k));
      }
      alert(err.message || String(err));
    } finally {
      busy = false;
      setProgress(null);
      if (ed) { renderGroups(); status(); }
    }
  }

  // drop files from the desktop onto a folder
  function wireFileDrop(grid, g) {
    if (!window.JoleroUpload) return;
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    grid.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = busy ? "none" : "copy";
      grid.classList.add("drop-files");
    });
    grid.addEventListener("dragleave", (e) => {
      if (!grid.contains(e.relatedTarget)) grid.classList.remove("drop-files");
    });
    grid.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      grid.classList.remove("drop-files");
      // folders arrive with no type and no extension: leave them out
      addFiles(g, [...e.dataTransfer.files].filter((f) => f.type || /\.[a-z0-9]{1,10}$/i.test(f.name)));
    });
  }

  // a file dropped beside a folder shouldn't make the browser open it
  for (const type of ["dragover", "drop"]) {
    window.addEventListener(type, (e) => {
      if (ed && e.dataTransfer && [...e.dataTransfer.types].includes("Files") && !e.target.closest(".ed-grid")) e.preventDefault();
    });
  }

  // Cancel: files this edit uploaded but never saved are deleted again
  async function discardUploads() {
    const saved = new Set((original.items || []).flatMap(keysOf));
    const keys = uploaded.filter((k) => !saved.has(k) && FILE_RE.test(k));
    uploaded = [];
    if (!keys.length) return;
    try { await api("POST", `/admin/g/${G.id}/delete`, JSON.stringify({ files: keys }), { "content-type": "application/json" }); }
    catch (e) { /* a leftover file is harmless; the gallery never points at it */ }
  }

  /* ---------- selecting ---------- */

  function toggle(tileEl, range) {
    const { g, it, i } = itemAt(tileEl);
    if (range && lastClicked && lastClicked.g === g) {
      const [a, b] = [Math.min(lastClicked.i, i), Math.max(lastClicked.i, i)];
      for (let k = a; k <= b; k++) selected.add(g.items[k]);
    } else if (selected.has(it)) {
      selected.delete(it);
    } else {
      selected.add(it);
    }
    lastClicked = { g, i };
    paintSelection();
  }

  /* ---------- changes ---------- */

  // Take `moving` out of wherever they are and put them into `to` before
  // `anchor` (an item that isn't moving), or at the end when there's none
  function place(moving, to, anchor) {
    for (const g of groups) g.items = g.items.filter((it) => !moving.includes(it));
    const at = anchor ? to.items.indexOf(anchor) : -1;
    to.items.splice(at < 0 ? to.items.length : at, 0, ...moving);
    for (const g of groups) if (g.cover && !g.items.some((it) => it.t === g.cover)) g.cover = "";
    changed();
    renderGroups();
  }

  function ordered(set) {
    return groups.flatMap((g) => g.items.filter((it) => set.has(it)));
  }

  function moveSelected(where) {
    let to;
    if (where === "new") {
      to = { id: nextFolderId(), name: "New folder", cover: "", zip: null, items: [] };
      groups.push(to);
    } else if (where === "root") {
      to = { id: null, name: "", cover: "", zip: null, items: [] };
      groups.unshift(to);
    } else {
      to = groups[Number(where)];
    }
    place(ordered(selected), to, null);
    selected.clear();
    paintSelection();
    if (where === "new") {
      const inputs = document.querySelectorAll(".ed-gname");
      const last = inputs[inputs.length - 1];
      if (last) { last.scrollIntoView({ block: "center" }); last.focus(); last.select(); }
    }
  }

  function moveFolder(g, dir) {
    const fg = groups.filter((x) => x.id);
    const i = fg.indexOf(g);
    const j = i + dir;
    if (j < 0 || j >= fg.length) return;
    [fg[i], fg[j]] = [fg[j], fg[i]];
    groups = groups.filter((x) => !x.id).concat(fg);
    changed();
    renderGroups();
  }

  function makeCover() {
    const it = [...selected][0];
    const g = groups.find((x) => x.items.includes(it));
    if (!g || !g.id || !it.t) return;
    g.cover = it.t;
    selected.clear();
    changed();
    renderGroups();
  }

  function makeGalleryCover() {
    const it = [...selected][0];
    if (!it || !it.t) return;
    galleryCover = it.t;
    selected.clear();
    changed();
    renderGroups();
  }

  function deleteSelected() {
    const list = ordered(selected);
    if (!list.length) return;
    const what = list.length === 1 ? `"${list[0].name}"` : plural(list.length, "file");
    if (!confirm(`Delete ${what}? They're removed from the gallery when you save, and deleted for good.`)) return;
    removed.push(...list);
    for (const g of groups) g.items = g.items.filter((it) => !selected.has(it));
    selected.clear();
    changed();
    renderGroups();
  }

  /* ---------- dragging: mouse anywhere on a tile, touch by the grip ---------- */

  let justDragged = false;

  function wireDrag(host) {
    let drag = null;
    let ghost = null;
    let marker = null;
    let scrollTimer = 0;

    const clearMarker = () => {
      if (marker) marker.classList.remove("drop-before", "drop-after", "drop-end");
      marker = null;
    };

    function target(x, y) {
      ghost.style.display = "none";
      const under = document.elementFromPoint(x, y);
      ghost.style.display = "";
      if (!under) return null;
      const t = under.closest(".ed-tile");
      if (t && !t.classList.contains("is-moving")) {
        const r = t.getBoundingClientRect();
        const { g, i } = itemAt(t);
        return { el: t, g, index: x < r.left + r.width / 2 ? i : i + 1, side: x < r.left + r.width / 2 ? "drop-before" : "drop-after" };
      }
      const grid = under.closest(".ed-grid") || (under.closest(".ed-group") || { querySelector: () => null }).querySelector(".ed-grid");
      if (grid) {
        const g = groups[Number(grid.dataset.g)];
        return { el: grid, g, index: g.items.length, side: "drop-end" };
      }
      return null;
    }

    host.addEventListener("pointerdown", (e) => {
      const t = e.target.closest(".ed-tile");
      if (!t || (e.pointerType === "mouse" && e.button !== 0)) return;
      const onGrip = !!e.target.closest(".ed-handle");
      if (e.pointerType !== "mouse" && !onGrip) return; // a finger elsewhere scrolls the page
      drag = { t, x: e.clientX, y: e.clientY, id: e.pointerId, live: false };
      if (onGrip) e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.live) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        const { it } = itemAt(drag.t);
        drag.moving = selected.has(it) ? ordered(selected) : [it];
        drag.live = true;
        ghost = el("div", "ed-ghost");
        const img = drag.t.querySelector("img");
        if (img) { const c = img.cloneNode(); ghost.appendChild(c); }
        if (drag.moving.length > 1) ghost.appendChild(el("span", "ed-ghost-n", String(drag.moving.length)));
        document.body.appendChild(ghost);
        document.body.classList.add("is-dragging");
        for (const tt of document.querySelectorAll(".ed-tile")) {
          if (drag.moving.includes(itemAt(tt).it)) tt.classList.add("is-moving");
        }
      }
      e.preventDefault();
      ghost.style.transform = `translate(${e.clientX - 40}px, ${e.clientY - 40}px)`;
      const tgt = target(e.clientX, e.clientY);
      clearMarker();
      drag.tgt = tgt;
      if (tgt) { marker = tgt.el; marker.classList.add(tgt.side); }
      // scroll when near the top or bottom of the window
      clearInterval(scrollTimer);
      const edge = 90;
      const dy = e.clientY < edge ? -14 : e.clientY > innerHeight - edge ? 14 : 0;
      if (dy) scrollTimer = setInterval(() => window.scrollBy(0, dy), 16);
    }, { passive: false });

    const finish = (e, cancel) => {
      if (!drag || e.pointerId !== drag.id) return;
      clearInterval(scrollTimer);
      const d = drag;
      drag = null;
      if (!d.live) return;
      clearMarker();
      ghost.remove();
      ghost = null;
      document.body.classList.remove("is-dragging");
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 50);
      for (const tt of document.querySelectorAll(".is-moving")) tt.classList.remove("is-moving");
      if (cancel || !d.tgt) return;
      // the first item at or after the drop point that isn't itself moving
      const after = d.tgt.g.items.slice(d.tgt.index).find((it) => !d.moving.includes(it)) || null;
      place(d.moving, d.tgt.g, after);
    };
    window.addEventListener("pointerup", (e) => finish(e, false));
    window.addEventListener("pointercancel", (e) => finish(e, true));

    host.addEventListener("click", (e) => {
      const t = e.target.closest(".ed-tile");
      if (!t || justDragged) return;
      toggle(t, e.shiftKey);
    });
    host.addEventListener("keydown", (e) => {
      const t = e.target.closest(".ed-tile");
      if (!t) return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(t, e.shiftKey); return; }
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      e.preventDefault();
      const { g, it, i } = itemAt(t);
      const j = i + (e.key === "ArrowLeft" ? -1 : 1);
      if (j < 0 || j >= g.items.length) return;
      g.items.splice(i, 1);
      g.items.splice(j, 0, it);
      changed();
      renderGroups();
      const moved = document.querySelector(`.ed-grid[data-g="${groups.indexOf(g)}"] .ed-tile[data-i="${j}"]`);
      if (moved) moved.focus();
    });
  }

  /* ---------- saving ---------- */

  const scopeOf = (g) => g.id || null;
  const keysOf = (it) => [it.o, it.p, it.t].filter((k) => k && FILE_RE.test(k));

  async function saveAll() {
    const save = $("ed-save");
    save.disabled = true;
    save.textContent = "Saving…";
    try {
      const next = clone(original);
      next.title = fields.title.value.trim() || original.title || "Gallery";
      next.message = fields.note.value.trim();
      next.locked = fields.locked.value === "1";
      next.keep = fields.keep.checked;
      next.expires = fields.until.value ? `${fields.until.value}T23:59:59Z` : "";
      // the gallery's cover, if that photo is still in it
      next.cover = groups.some((g) => g.items.some((it) => it.t === galleryCover)) ? galleryCover : "";
      if (!next.cover) delete next.cover;

      // client: an existing one, a new one, or none
      const pick = fields.client.value;
      if (pick === "__new") {
        const name = fields.newName.value.trim();
        if (!name) throw new Error("Type the new client's name, or pick an existing client.");
        const row = await addClient(name, fields.newContact.value.trim());
        clients = (clients || []).concat(row);
        next.clientId = row.id;
        next.client = row.name;
        fillClients(fields.client, fields.newName, fields.newName.closest(".ed-newclient"));
        fields.client.value = row.id;
        fields.newName.closest(".ed-newclient").hidden = true;
      } else if (pick !== "__keep") {
        const c = (clients || []).find((x) => x.id === pick);
        next.clientId = c ? c.id : "";
        next.client = c ? c.name : "";
      }

      // files: loose ones first, then each folder in order
      const kept = groups.filter((g) => g.items.length);
      const loose = kept.filter((g) => !g.id).flatMap((g) => g.items);
      const inFolders = kept.filter((g) => g.id);
      next.items = loose.map((it) => { const c = clone(it); delete c.f; return c; })
        .concat(inFolders.flatMap((g) => g.items.map((it) => ({ ...clone(it), f: g.id }))));

      // A stored zip whose contents changed is out of date: drop it. Download
      // all is then built on the fly from the files that are left.
      const before = new Map();
      for (const g of buildGroups(original)) before.set(scopeOf(g), g.items.map((it) => it.o).join("|"));
      const stale = [];
      const zipFor = (g) => {
        const same = before.get(scopeOf(g)) === g.items.map((it) => it.o).join("|");
        if (g.zip && g.zip.o && !same) { stale.push(g.zip.o); return null; }
        return g.zip || null;
      };
      const rootGroup = kept.find((g) => !g.id);
      next.zip = rootGroup ? zipFor(rootGroup) : null;
      if (!rootGroup && original.zip && original.zip.o) stale.push(original.zip.o);
      next.folders = inFolders.map((g) => ({
        id: g.id,
        name: g.name.trim() || "Folder",
        cover: g.items.some((it) => it.t === g.cover) ? g.cover
          : (g.items.find((it) => it.type === "photo" && it.t) || g.items.find((it) => it.t) || {}).t || "",
        zip: zipFor(g),
      }));
      for (const f of original.folders || []) {
        if (f.zip && f.zip.o && !next.folders.some((n) => n.id === f.id)) stale.push(f.zip.o);
      }

      await putManifest(next);

      // now delete what's no longer used: removed files and out-of-date zips
      const inUse = new Set(next.items.flatMap(keysOf));
      const files = [...new Set(removed.flatMap(keysOf).concat(stale))].filter((k) => !inUse.has(k) && FILE_RE.test(k));
      if (files.length) await api("POST", `/admin/g/${G.id}/delete`, JSON.stringify({ files }), { "content-type": "application/json" });
      // and any stored zip the on-the-fly ones now cover completely
      await api("POST", `/admin/g/${G.id}/drop-zips`);

      const fresh = await getManifest();
      uploaded = [];
      dirty = false;
      close();
      G.show(fresh);
      flash("Saved");
    } catch (err) {
      alert(err.message || String(err));
      save.disabled = false;
    } finally {
      if ($("ed-save")) $("ed-save").textContent = "Save changes";
    }
  }

  function flash(text) {
    const f = el("div", "ed-flash", text);
    f.setAttribute("role", "status");
    document.body.appendChild(f);
    setTimeout(() => f.classList.add("is-out"), 1800);
    setTimeout(() => f.remove(), 2400);
  }
})();
