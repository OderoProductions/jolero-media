/* ============================================================
   JOLERO MEDIA PORTAL — galleries.js  (admin/galleries.html)

   Client galleries, run from the browser instead of the Mac tool:
   every gallery on the gallery worker with its link and status, a
   "New gallery" form you drop a folder onto, and the everyday changes
   (lock, unlock, extend, switch off, note, add files, delete).

   Making a gallery here:
     · photos get a 900px thumbnail and a 2048px preview, made in this
       browser from the original (turned upright, camera data dropped)
     · videos the browser can play are used as their own preview, with a
       poster frame grabbed here; anything it can't play (ProRes, HEIC on
       Chrome, RAW) goes up as a download
     · each folder gets a Download all zip (under 3.9 GB), written here
       as it uploads, so nothing big sits in memory
     · files go straight to Cloudflare R2 through the worker, in 50 MB
       pieces, and the gallery only appears once everything is up.

   Calls carry the signed-in admin's Supabase token; the worker asks
   Supabase whether that person is an admin before doing anything.
   Same manifest format as the jolero-gallery Mac tool, so galleries
   made either way can be managed from both.
   ============================================================ */

(function () {
  "use strict";

  // On localhost it talks to `wrangler dev` (see the jolero-gallery README)
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = LOCAL ? "http://localhost:8787" : "https://jolero-gallery.jolero-gallery-worker.workers.dev";
  var SITE = LOCAL ? location.origin + "/gallery/" : "https://joleromedia.com/gallery/";
  var PART = 50 * 1024 * 1024;
  var ZIP_LIMIT = 3.9 * 1024 * 1024 * 1024;   // browser zips stay under 4 GB (no zip64)
  var GRACE_DAYS = 90;                          // matches the worker's sweep

  var PHOTO = /\.(jpe?g|png|webp|gif|heic|heif|tiff?|dng|cr2|cr3|nef|arw|raf|orf|rw2)$/i;
  var VIDEO = /\.(mp4|mov|m4v|webm|mxf|avi|mkv|mts|m2ts)$/i;
  var TYPES = { heic: "image/heic", heif: "image/heif", mov: "video/quicktime", mxf: "application/mxf",
                mts: "video/mp2t", m2ts: "video/mp2t", dng: "image/x-adobe-dng" };

  var $ = function (id) { return document.getElementById(id); };
  var list = $("gallery-list");
  if (!list) return;

  /* ---------- small helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function human(n) {
    var u = ["B", "KB", "MB", "GB", "TB"], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i < 2 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
  }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function day(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
  function slug(s) {
    var out = String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
    return out || "file";
  }
  function natural(a, b) { return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }); }
  function kind(name) { return VIDEO.test(name) ? "video" : PHOTO.test(name) ? "photo" : "file"; }
  function ext(name) { var m = /\.([a-z0-9]{1,10})$/i.exec(name); return m ? m[1].toLowerCase() : ""; }
  function contentType(file) {
    return file.type || TYPES[ext(file.name)] || "application/octet-stream";
  }
  function pad4(n) { return String(n).padStart(4, "0"); }
  function newId() {
    while (true) {
      var b = new Uint8Array(9);
      crypto.getRandomValues(b);
      var id = btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_");
      if (/^[A-Za-z0-9]/.test(id)) return id;   // never starts with "-" (the Mac tool reads ids as arguments)
    }
  }
  function linkFor(title, id) {
    var name = slug(title);
    return SITE + "#" + (name && name !== "file" ? name + "/" : "") + id;
  }
  async function copy(text, btn) {
    var ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (e) {
      // older browsers: copy from a temporary text box instead
      var ta = el("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch (e2) {}
      ta.remove();
    }
    if (btn) {
      var t = btn.textContent;
      btn.textContent = ok ? "Copied" : "Select and copy the link";
      setTimeout(function () { btn.textContent = t; }, 1800);
    }
  }

  /* ---------- talking to the worker ---------- */

  async function token() {
    var t = await PortalAuth.getToken();
    if (!t) throw new Error("You've been signed out. Sign in again, then retry.");
    return t;
  }

  async function api(method, path, body, headers) {
    var init = { method: method, headers: Object.assign({ authorization: "Bearer " + (await token()) }, headers || {}) };
    if (body !== undefined) init.body = body;
    var res = await fetch(API + path, init);
    var text = await res.text();
    if (!res.ok) {
      var detail = text;
      try { detail = JSON.parse(text).error || text; } catch (e) {}
      if (res.status === 401) throw new Error("The gallery service didn't accept this sign-in. Sign out and back in, then retry.");
      throw new Error(method + " " + path.split("?")[0] + " failed (" + res.status + "): " + detail);
    }
    return text ? JSON.parse(text) : null;
  }

  async function getManifest(id) {
    return api("GET", "/admin/o/g/" + id + "/manifest.json");
  }
  async function putManifest(man) {
    var body = JSON.stringify(man);
    await api("PUT", "/admin/o/g/" + man.id + "/manifest.json", body, {
      "content-type": "application/json; charset=utf-8",
      "x-meta-expires": man.expires || "",
      "x-meta-locked": man.locked ? "1" : "0",
      "x-meta-keep": man.keep ? "1" : "0",
      "x-meta-title": encodeURIComponent(man.title || "")
    });
  }

  /* Upload with progress (fetch can't report upload progress, XHR can) and
     a couple of retries for dropped connections and server hiccups. */
  async function send(method, path, body, headers, onBytes) {
    var bearer = await token();
    var last;
    for (var attempt = 0; attempt < 4; attempt++) {
      try {
        return await new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          var sent = 0;
          xhr.open(method, API + path);
          xhr.setRequestHeader("authorization", "Bearer " + bearer);
          Object.keys(headers || {}).forEach(function (k) { xhr.setRequestHeader(k, headers[k]); });
          xhr.upload.onprogress = function (e) { if (onBytes) { onBytes(e.loaded - sent); sent = e.loaded; } };
          xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
            } else {
              if (onBytes) onBytes(-sent);
              var err = new Error(method + " " + path.split("?")[0] + " failed (" + xhr.status + ")");
              err.status = xhr.status;
              reject(err);
            }
          };
          xhr.onerror = function () { if (onBytes) onBytes(-sent); reject(new Error("Connection dropped")); };
          xhr.send(body);
        });
      } catch (err) {
        last = err;
        if (err.status && err.status < 500 && err.status !== 429) throw err;
        await new Promise(function (r) { setTimeout(r, 1500 * Math.pow(2, attempt)); });
        bearer = await token();
      }
    }
    throw last;
  }

  function metaHeaders(meta) {
    var h = {};
    Object.keys(meta || {}).forEach(function (k) { h["x-meta-" + k] = encodeURIComponent(String(meta[k])); });
    return h;
  }

  async function putBlob(key, blob, type, meta, onBytes) {
    if (blob.size > PART) return putBig(key, blob, type, meta, onBytes);
    await send("PUT", "/admin/o/" + encodeURI(key), blob,
      Object.assign({ "content-type": type || "application/octet-stream" }, metaHeaders(meta)), onBytes);
  }

  async function putBig(key, blob, type, meta, onBytes) {
    var path = "/admin/mpu/" + encodeURI(key);
    var created = await send("POST", path + "?action=create", "",
      Object.assign({ "content-type": type || "application/octet-stream" }, metaHeaders(meta)));
    var uid = encodeURIComponent(created.uploadId);
    var count = Math.ceil(blob.size / PART);
    var parts = new Array(count);
    var next = 0;
    try {
      // three pieces at a time
      await Promise.all([0, 1, 2].map(async function () {
        while (next < count) {
          var i = next++;
          var r = await send("PUT", path + "?uploadId=" + uid + "&part=" + (i + 1),
            blob.slice(i * PART, Math.min((i + 1) * PART, blob.size)), {}, onBytes);
          parts[i] = { partNumber: r.partNumber, etag: r.etag };
        }
      }));
      await send("POST", path + "?action=complete&uploadId=" + uid, JSON.stringify({ parts: parts }),
        { "content-type": "application/json" });
    } catch (err) {
      try { await send("DELETE", path + "?uploadId=" + uid, null, {}); } catch (e) {}
      throw err;
    }
  }

  /* ---------- previews, made in this browser ---------- */

  function toJpeg(source, width, height, edge, quality) {
    var s = Math.min(1, edge / Math.max(width, height));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width * s));
    c.height = Math.max(1, Math.round(height * s));
    var ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) { b ? resolve({ blob: b, canvas: c }) : reject(new Error("Couldn't encode a preview")); },
        "image/jpeg", quality);
    });
  }

  async function photoPreviews(file) {
    var bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) { return null; }   // a format this browser can't open: it goes up as a download
    try {
      var preview = await toJpeg(bmp, bmp.width, bmp.height, 2048, 0.82);
      var thumb = await toJpeg(preview.canvas, preview.canvas.width, preview.canvas.height, 900, 0.74);
      return { w: bmp.width, h: bmp.height, preview: preview.blob, thumb: thumb.blob };
    } catch (e) {
      return null;
    } finally {
      bmp.close();
    }
  }

  function videoPreview(file) {
    return new Promise(function (resolve) {
      var v = document.createElement("video");
      var url = URL.createObjectURL(file);
      var done = false;
      function finish(result) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.removeAttribute("src");
        v.load();
        URL.revokeObjectURL(url);
        resolve(result);
      }
      var timer = setTimeout(function () { finish(null); }, 20000);
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.onerror = function () { finish(null); };
      v.onloadedmetadata = function () {
        if (!v.videoWidth || !isFinite(v.duration)) return finish(null);
        v.currentTime = Math.min(2, v.duration * 0.1);
      };
      v.onseeked = async function () {
        try {
          var poster = await toJpeg(v, v.videoWidth, v.videoHeight, 1280, 0.8);
          finish({ w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration * 100) / 100, poster: poster.blob });
        } catch (e) { finish(null); }
      };
      v.src = url;
    });
  }

  /* ---------- Download all: a zip written as it uploads ----------
     Stored, not compressed (photos and video are already compressed), with
     data descriptors so each file's checksum can come after its bytes: one
     pass over each file, and the zip goes up in 50 MB pieces as it's made. */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(crc, bytes) {
    crc = crc ^ 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(ms) {
    var d = new Date(ms || Date.now());
    var year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  function zipSize(entries) {
    var enc = new TextEncoder();
    return entries.reduce(function (n, e) {
      var nameLen = enc.encode(e.arcname).length;
      return n + 30 + nameLen + e.file.size + 16 + 46 + nameLen;
    }, 22);
  }

  async function uploadZip(key, entries, zipName, onBytes) {
    var path = "/admin/mpu/" + encodeURI(key);
    var created = await send("POST", path + "?action=create", "",
      Object.assign({ "content-type": "application/zip" }, metaHeaders({ filename: zipName })));
    var uid = encodeURIComponent(created.uploadId);
    var parts = [];
    var pending = [];           // Blobs/Uint8Arrays not yet sent
    var pendingBytes = 0;
    var offset = 0;
    var central = [];
    var enc = new TextEncoder();

    async function push(chunk) {
      pending.push(chunk);
      pendingBytes += chunk.size != null ? chunk.size : chunk.length;
      offset += chunk.size != null ? chunk.size : chunk.length;
      while (pendingBytes >= PART) await flush(PART);
    }
    async function flush(n) {
      var all = new Blob(pending);
      var piece = all.slice(0, n);
      var rest = all.slice(n);
      pending = rest.size ? [rest] : [];
      pendingBytes = rest.size;
      var r = await send("PUT", path + "?uploadId=" + uid + "&part=" + (parts.length + 1), piece, {}, onBytes);
      parts.push({ partNumber: r.partNumber, etag: r.etag });
    }

    try {
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var name = enc.encode(e.arcname);
        var t = dosTime(e.file.lastModified);
        var start = offset;
        var head = new DataView(new ArrayBuffer(30));
        head.setUint32(0, 0x04034b50, true);
        head.setUint16(4, 20, true);              // version needed
        head.setUint16(6, 0x0808, true);          // data descriptor + UTF-8 names
        head.setUint16(8, 0, true);               // stored
        head.setUint16(10, t.time, true);
        head.setUint16(12, t.date, true);
        // crc and sizes are 0 here; they follow the data
        head.setUint16(26, name.length, true);
        await push(new Uint8Array(head.buffer));
        await push(name);

        var crc = 0;
        var reader = e.file.stream().getReader();
        while (true) {
          var step = await reader.read();
          if (step.done) break;
          crc = crc32(crc, step.value);
          await push(step.value);
        }
        var desc = new DataView(new ArrayBuffer(16));
        desc.setUint32(0, 0x08074b50, true);
        desc.setUint32(4, crc, true);
        desc.setUint32(8, e.file.size, true);
        desc.setUint32(12, e.file.size, true);
        await push(new Uint8Array(desc.buffer));
        central.push({ name: name, crc: crc, size: e.file.size, offset: start, t: t });
      }

      var cdStart = offset;
      for (var j = 0; j < central.length; j++) {
        var c = central[j];
        var cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true);
        cd.setUint16(4, 20, true);
        cd.setUint16(6, 20, true);
        cd.setUint16(8, 0x0808, true);
        cd.setUint16(10, 0, true);
        cd.setUint16(12, c.t.time, true);
        cd.setUint16(14, c.t.date, true);
        cd.setUint32(16, c.crc, true);
        cd.setUint32(20, c.size, true);
        cd.setUint32(24, c.size, true);
        cd.setUint16(28, c.name.length, true);
        cd.setUint32(42, c.offset, true);
        await push(new Uint8Array(cd.buffer));
        await push(c.name);
      }
      var end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, central.length, true);
      end.setUint16(10, central.length, true);
      end.setUint32(12, offset - cdStart, true);
      end.setUint32(16, cdStart, true);
      await push(new Uint8Array(end.buffer));
      if (pendingBytes) await flush(pendingBytes);

      await send("POST", path + "?action=complete&uploadId=" + uid, JSON.stringify({ parts: parts }),
        { "content-type": "application/json" });
      return offset;
    } catch (err) {
      try { await send("DELETE", path + "?uploadId=" + uid, null, {}); } catch (e2) {}
      throw err;
    }
  }

  /* ---------- reading what was dropped ---------- */

  function isHidden(path) { return path.split("/").some(function (p) { return !p || p.charAt(0) === "."; }); }

  async function readEntry(entry, prefix, out) {
    if (entry.isFile) {
      var file = await new Promise(function (res, rej) { entry.file(res, rej); });
      out.push({ file: file, path: prefix + file.name });
    } else if (entry.isDirectory) {
      var reader = entry.createReader();
      while (true) {
        var batch = await new Promise(function (res, rej) { reader.readEntries(res, rej); });
        if (!batch.length) break;
        for (var i = 0; i < batch.length; i++) await readEntry(batch[i], prefix + entry.name + "/", out);
      }
    }
  }

  /* Normalise to {file, path} relative to the gallery root. If everything
     sits in one top folder, that folder IS the gallery (its name becomes
     the default title) and its subfolders become gallery folders. */
  function normalise(items) {
    items = items.filter(function (it) { return !isHidden(it.path); });
    var tops = {};
    items.forEach(function (it) { tops[it.path.split("/")[0]] = true; });
    var names = Object.keys(tops);
    var root = "";
    if (names.length === 1 && items.every(function (it) { return it.path.indexOf("/") !== -1; })) {
      root = names[0];
      items = items.map(function (it) { return { file: it.file, path: it.path.slice(root.length + 1) }; });
    }
    return { root: root, items: items };
  }

  function groupsOf(items) {
    var order = { video: 0, photo: 1, file: 2 };
    var groups = {};
    items.forEach(function (it) {
      var parts = it.path.split("/");
      var g = parts.length > 1 ? parts[0] : "";
      (groups[g] = groups[g] || []).push(it);
    });
    Object.keys(groups).forEach(function (g) {
      groups[g].sort(function (a, b) {
        return (order[kind(a.file.name)] - order[kind(b.file.name)]) || natural(a.path, b.path);
      });
    });
    var names = Object.keys(groups).filter(function (g) { return g; }).sort(natural);
    return { root: groups[""] || [], folders: names.map(function (n) { return { name: n, items: groups[n] }; }) };
  }

  /* ---------- building a gallery (or adding to one) ---------- */

  /* plan: [{ fid|null, name|null, items:[{file, path}] }]; returns items,
     folders, root zip, and every key it wrote (for cleaning up a failure). */
  async function build(gid, title, plan, start, progress) {
    var items = [];
    var uploads = [];           // { key, blob, type, meta }
    var zips = [];              // { key, entries, name, fid }
    var n = start;
    var total = plan.reduce(function (s, g) { return s + g.items.length; }, 0);
    var made = 0;

    for (var gi = 0; gi < plan.length; gi++) {
      var g = plan[gi];
      for (var ii = 0; ii < g.items.length; ii++, n++) {
        var file = g.items[ii].file;
        var k = kind(file.name);
        made++;
        progress.stage("Making previews", made + " of " + total + ": " + file.name);
        var e = ext(file.name);
        var orig = "o/" + pad4(n) + "-" + slug(file.name.replace(/\.[^.]+$/, "")) + (e ? "." + e : "");
        var item = { type: k, name: file.name, bytes: file.size, o: orig };
        if (g.fid) item.f = g.fid;
        if (k === "photo") {
          var p = await photoPreviews(file);
          if (p) {
            item.w = p.w; item.h = p.h;
            item.t = "t/" + pad4(n) + ".jpg";
            item.p = "p/" + pad4(n) + ".jpg";
            uploads.push({ key: item.t, blob: p.thumb, type: "image/jpeg" });
            uploads.push({ key: item.p, blob: p.preview, type: "image/jpeg" });
          } else {
            item.type = "file";
          }
        } else if (k === "video") {
          var v = await videoPreview(file);
          if (v) {
            // the original doubles as the preview: v/ keys stay playable when a gallery is locked
            item.o = "v/" + orig.slice(2);
            item.p = item.o;
            item.w = v.w; item.h = v.h; item.dur = v.dur;
            item.t = "t/" + pad4(n) + ".jpg";
            uploads.push({ key: item.t, blob: v.poster, type: "image/jpeg" });
          } else {
            item.type = "file";
          }
        }
        uploads.push({ key: item.o, blob: file, type: contentType(file), meta: { filename: file.name } });
        items.push(item);
      }
      var entries = g.items.map(function (it) {
        return { file: it.file, arcname: g.fid ? it.path.split("/").slice(1).join("/") : it.path };
      });
      if (entries.length > 1 && zipSize(entries) <= ZIP_LIMIT && !progress.noZip) {
        var zname = (title + (g.name ? " - " + g.name : "")).replace(/[\\/:*?"<>|]+/g, "-") + ".zip";
        var zkey = g.fid ? "o/" + g.fid + ".zip" : "o/all.zip";
        zips.push({ key: zkey, entries: entries, name: zname, fid: g.fid });
      }
    }

    // previews first so a half-finished upload is cheap to retry, then originals, then zips
    uploads.sort(function (a, b) { return (a.key.charAt(0) === "o" || a.key.charAt(0) === "v") - (b.key.charAt(0) === "o" || b.key.charAt(0) === "v"); });
    var bytes = uploads.reduce(function (s, u) { return s + u.blob.size; }, 0) +
                zips.reduce(function (s, z) { return s + zipSize(z.entries); }, 0);
    progress.begin(bytes);
    var keys = uploads.map(function (u) { return u.key; }).concat(zips.map(function (z) { return z.key; }));

    var next = 0;
    await Promise.all([0, 1, 2].map(async function () {
      while (next < uploads.length) {
        var u = uploads[next++];
        progress.stage("Uploading", u.meta ? u.meta.filename : "previews");
        await putBlob("g/" + gid + "/" + u.key, u.blob, u.type, u.meta, progress.add);
      }
    }));
    var zipInfo = {};
    for (var zi = 0; zi < zips.length; zi++) {
      var z = zips[zi];
      progress.stage("Building Download all", z.name);
      var size = await uploadZip("g/" + gid + "/" + z.key, z.entries, z.name, progress.add);
      zipInfo[z.fid || ""] = { o: z.key, name: z.name, bytes: size };
    }

    var folders = plan.filter(function (g) { return g.fid; }).map(function (g) {
      var mine = items.filter(function (it) { return it.f === g.fid; });
      return { id: g.fid, name: g.name, cover: cover(mine), zip: zipInfo[g.fid] || null };
    });
    return { items: items, folders: folders, rootZip: zipInfo[""] || null, keys: keys };
  }

  function cover(items) {
    var photo = items.find(function (it) { return it.type === "photo" && it.t; });
    var video = items.find(function (it) { return it.type === "video" && it.t; });
    return (photo || video || {}).t || "";
  }

  function nextFolderId(folders) {
    var max = 0;
    folders.forEach(function (f) { var m = /^f(\d+)$/.exec(f.id || ""); if (m) max = Math.max(max, +m[1]); });
    return "f" + (max + 1);
  }

  /* ---------- the form ---------- */

  var form = $("gallery-form");
  var drop = $("dropzone");
  var summary = $("dz-summary");
  var submit = $("g-submit");
  var titleIn = $("g-title");
  var folderField = $("foldername-field");
  var folderIn = $("g-folder");
  var progressBox = $("upload-progress");
  var doneBox = $("upload-done");
  var adder = $("new-gallery");
  var formHead = $("form-head");
  var picked = null;          // { root, items }
  var addTo = null;           // manifest when adding to an existing gallery
  var busy = false;

  function setPicked(p) {
    picked = p && p.items.length ? p : null;
    if (!picked) {
      summary.hidden = true;
      submit.disabled = true;
      return;
    }
    var gr = groupsOf(picked.items);
    var counts = { photo: 0, video: 0, file: 0 };
    var size = 0;
    picked.items.forEach(function (it) { counts[kind(it.file.name)]++; size += it.file.size; });
    var bits = [];
    if (counts.photo) bits.push(plural(counts.photo, "photo"));
    if (counts.video) bits.push(plural(counts.video, "video"));
    if (counts.file) bits.push(plural(counts.file, "other file"));
    var text = bits.join(", ") + ", " + human(size);
    if (gr.folders.length) text += " · " + plural(gr.folders.length, "folder") + ": " + gr.folders.map(function (f) { return f.name; }).join(", ");
    summary.textContent = text;
    summary.hidden = false;
    if (!addTo && picked.root && !titleIn.value) titleIn.value = picked.root;
    if (addTo && picked.root && !folderIn.value) folderIn.value = picked.root;
    submit.disabled = busy;
  }

  async function fromDrop(dt) {
    var out = [];
    var entries = [];
    for (var i = 0; i < dt.items.length; i++) {
      var en = dt.items[i].webkitGetAsEntry && dt.items[i].webkitGetAsEntry();
      if (en) entries.push(en);
    }
    if (entries.length) {
      for (var j = 0; j < entries.length; j++) await readEntry(entries[j], "", out);
    } else {
      for (var k = 0; k < dt.files.length; k++) out.push({ file: dt.files[k], path: dt.files[k].name });
    }
    return normalise(out);
  }

  ["dragenter", "dragover"].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
  });
  ["dragleave", "drop"].forEach(function (t) {
    drop.addEventListener(t, function () { drop.classList.remove("is-over"); });
  });
  drop.addEventListener("drop", async function (e) {
    e.preventDefault();
    if (busy) return;
    setPicked(await fromDrop(e.dataTransfer));
  });
  $("pick-folder").addEventListener("click", function () { $("folder-input").click(); });
  $("pick-files").addEventListener("click", function () { $("files-input").click(); });
  $("folder-input").addEventListener("change", function (e) {
    setPicked(normalise([].map.call(e.target.files, function (f) { return { file: f, path: f.webkitRelativePath || f.name }; })));
    e.target.value = "";
  });
  $("files-input").addEventListener("change", function (e) {
    setPicked(normalise([].map.call(e.target.files, function (f) { return { file: f, path: f.name }; })));
    e.target.value = "";
  });
  $("g-reset").addEventListener("click", resetForm);

  function resetForm() {
    form.reset();
    $("g-new-client").hidden = true;
    if (clients.length || $("g-client").options.length > 1) fillClients($("g-client"), "");
    addTo = null;
    folderField.hidden = true;
    $("title-field").hidden = false;
    $("new-only").hidden = false;
    formHead.textContent = "New gallery";
    setPicked(null);
  }

  function startAdding(man) {
    resetForm();
    addTo = man;
    formHead.textContent = "Add files to " + man.title;
    folderField.hidden = false;
    $("title-field").hidden = true;
    $("new-only").hidden = true;
    adder.open = true;
    adder.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* progress display */
  function makeProgress() {
    var total = 1, done = 0, t0 = Date.now();
    var fill = $("up-fill"), stageEl = $("up-stage"), detail = $("up-detail");
    function draw() {
      var pct = Math.min(100, done / total * 100);
      fill.style.width = pct.toFixed(1) + "%";
      var secs = (Date.now() - t0) / 1000;
      var rate = done / Math.max(secs, 0.5);
      var left = rate > 1 ? (total - done) / rate : 0;
      detail.textContent = human(done) + " of " + human(total) + " · " + Math.round(pct) + "%" +
        (secs > 5 && left > 5 ? " · about " + (left > 90 ? Math.round(left / 60) + " min" : Math.round(left) + "s") + " left" : "");
    }
    return {
      noZip: false,
      stage: function (s, what) { stageEl.textContent = s + (what ? ": " + what : ""); },
      begin: function (bytes) { total = Math.max(bytes, 1); done = 0; t0 = Date.now(); draw(); },
      add: function (n) { done += n; draw(); }
    };
  }

  function warnLeave(e) { e.preventDefault(); e.returnValue = ""; }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!picked || busy) return;
    var title = (titleIn.value || "").trim();
    if (!addTo && !title) { titleIn.focus(); return; }
    if (addTo && !(folderIn.value || "").trim()) { folderIn.focus(); return; }

    busy = true;
    submit.disabled = true;
    form.classList.add("is-busy");
    progressBox.hidden = false;
    doneBox.hidden = true;
    window.addEventListener("beforeunload", warnLeave);
    var progress = makeProgress();
    var gid = addTo ? addTo.id : newId();
    var written = [];

    try {
      if (addTo) {
        await addFiles(addTo, folderIn.value.trim(), progress, written);
        showDone(addTo.title, gid, "Added. Same link as before:");
      } else {
        var days = $("g-days").value;
        var gr = groupsOf(picked.items);
        var plan = [{ fid: null, name: null, items: gr.root }].concat(gr.folders.map(function (f, i) {
          return { fid: "f" + (i + 1), name: f.name, items: f.items };
        })).filter(function (g) { return g.items.length; });
        var who = await resolveClient($("g-client"), $("g-nc-name"), $("g-nc-email"));
        var out = await build(gid, title, plan, 1, progress);
        written = out.keys;
        progress.stage("Finishing");
        await putManifest({
          v: 2, id: gid, title: title,
          client: who ? who.name : "",
          clientId: who ? who.id : "",
          message: ($("g-message").value || "").trim(),
          created: new Date().toISOString(),
          expires: days === "never" ? "" : new Date(Date.now() + days * 86400000).toISOString(),
          locked: $("g-hold").value === "1",
          zip: out.rootZip, folders: out.folders, items: out.items
        });
        showDone(title, gid, "Gallery ready. The link for your client:");
      }
      resetForm();
      loadList();
    } catch (err) {
      $("up-stage").textContent = "That didn't finish: " + (err.message || err) + ". Cleaning up…";
      try {
        if (!addTo) await api("DELETE", "/admin/g/" + gid);
        else for (var i = 0; i < written.length; i++) {
          try { await api("DELETE", "/admin/o/g/" + gid + "/" + written[i]); } catch (e2) {}
        }
        $("up-stage").textContent = "That didn't finish: " + (err.message || err) +
          ". Nothing was left half-made, so you can just try again.";
      } catch (e3) {
        $("up-stage").textContent = "That didn't finish: " + (err.message || err) + ". Couldn't tidy up either; the list below may show an incomplete upload you can delete.";
      }
    } finally {
      busy = false;
      submit.disabled = !picked;
      form.classList.remove("is-busy");
      window.removeEventListener("beforeunload", warnLeave);
    }
  });

  async function addFiles(man, folderName, progress, written) {
    var folders = (man.folders || []).slice();
    var items = (man.items || []).slice();
    var taken = {};
    folders.forEach(function (f) { taken[f.name.trim().toLowerCase()] = true; });
    var known = {};
    folders.forEach(function (f) { known[f.id] = true; });

    // loose items become a folder of their own, so the client sees matching covers
    var loose = items.filter(function (it) { return !known[it.f]; });
    if (loose.length) {
      var types = {};
      loose.forEach(function (it) { types[it.type] = true; });
      var lname = Object.keys(types).length === 1 ? ({ photo: "Photos", video: "Videos" }[Object.keys(types)[0]] || "Files") : "Files";
      if (taken[lname.toLowerCase()]) lname = lname + " 2";
      var lid = nextFolderId(folders);
      loose.forEach(function (it) { it.f = lid; });
      folders.push({ id: lid, name: lname, cover: cover(loose), zip: man.zip || null });
      man.zip = null;
      taken[lname.toLowerCase()] = true;
    }

    var gr = groupsOf(picked.items);
    var groups = [];
    if (gr.root.length) groups.push({ name: folderName, items: gr.root });
    gr.folders.forEach(function (f) { groups.push({ name: f.name, items: f.items }); });
    var plan = [];
    groups.forEach(function (g) {
      if (taken[g.name.toLowerCase()]) throw new Error("This gallery already has a folder called \"" + g.name + "\". Pick another name");
      taken[g.name.toLowerCase()] = true;
      var fid = nextFolderId(folders.concat(plan.map(function (p) { return { id: p.fid }; })));
      plan.push({ fid: fid, name: g.name, items: g.items });
    });

    var start = 1 + items.reduce(function (m, it) { var x = /^[ov]\/(\d+)-/.exec(it.o || ""); return x ? Math.max(m, +x[1]) : m; }, items.length);
    var out = await build(man.id, man.title, plan, start, progress);
    written.push.apply(written, out.keys);
    progress.stage("Finishing");
    man.v = 2;
    man.folders = folders.concat(out.folders);
    man.items = items.concat(out.items);
    await putManifest(man);
  }

  function showDone(title, id, lead) {
    var link = linkFor(title, id);
    progressBox.hidden = true;
    doneBox.hidden = false;
    $("done-lead").textContent = lead;
    var a = $("done-link");
    a.href = link;
    a.textContent = link;
    $("done-copy").onclick = function () { copy(link, $("done-copy")); };
  }

  /* ---------- the list ---------- */

  var dialog = $("g-dialog");

  function ask(title, body, okLabel, withText, initial) {
    return new Promise(function (resolve) {
      $("gd-title").textContent = title;
      $("gd-body").textContent = body;
      var ta = $("gd-text");
      ta.hidden = !withText;
      ta.value = initial || "";
      var ok = $("gd-ok");
      ok.textContent = okLabel;
      function close(result) {
        ok.onclick = null; $("gd-cancel").onclick = null;
        dialog.close();
        resolve(result);
      }
      ok.onclick = function () { close(withText ? ta.value : true); };
      $("gd-cancel").onclick = function () { close(null); };
      dialog.onclose = function () { resolve(null); };
      dialog.showModal();
      if (withText) ta.focus();
    });
  }

  function status(g) {
    if (g.incomplete) return { text: "Incomplete upload", tone: "warn" };
    var exp = g.expires ? Date.parse(g.expires) : 0;
    if (exp && exp <= Date.now()) {
      return g.keep ? { text: "Link expired · files kept", tone: "off" }
                    : { text: "Link expired · files deleted " + day(new Date(exp + GRACE_DAYS * 86400000).toISOString()), tone: "off" };
    }
    var s = g.locked ? "Downloads locked" : "Live";
    return { text: s + (exp ? " · until " + day(g.expires) : " · no expiry"), tone: g.locked ? "warn" : "live" };
  }

  async function change(id, fn, msg) {
    var man = await getManifest(id);
    fn(man);
    await putManifest(man);
    flash(msg);
    loadList();
  }

  function flash(text) {
    var f = $("g-flash");
    f.textContent = text;
    f.hidden = false;
    clearTimeout(flash.t);
    flash.t = setTimeout(function () { f.hidden = true; }, 4000);
  }

  function btn(label, onClick, cls) {
    var b = el("button", "link-quiet g-act" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.addEventListener("click", async function () {
      b.disabled = true;
      try { await onClick(b); } catch (err) { flash(err.message || String(err)); }
      b.disabled = false;
    });
    return b;
  }

  async function loadList() {
    var galleries;
    try {
      galleries = await api("GET", "/admin/galleries");
    } catch (err) {
      list.textContent = "";
      list.appendChild(el("p", "empty-note", "Couldn't load galleries: " + err.message));
      return;
    }
    galleries.sort(function (a, b) { return (b.created || "").localeCompare(a.created || ""); });
    $("g-count").textContent = galleries.length || "";
    list.textContent = "";
    if (!galleries.length) {
      list.appendChild(el("p", "empty-note", "No galleries yet. Make the first one above."));
      return;
    }
    galleries.forEach(function (g) {
      var row = el("article", "panel g-row");
      if (g.incomplete) {
        row.appendChild(el("p", "g-title", "Incomplete upload (" + g.id + ")"));
        var acts0 = el("div", "g-actions");
        acts0.appendChild(btn("Delete", async function () {
          if (await ask("Delete this incomplete upload?", "It never finished, so no client has its link.", "Delete")) {
            await api("DELETE", "/admin/g/" + g.id); flash("Deleted."); loadList();
          }
        }, "is-danger"));
        row.appendChild(acts0);
        list.appendChild(row);
        return;
      }
      var head = el("div", "g-head");
      var name = el("p", "g-title", g.title || "Untitled");
      head.appendChild(name);
      var st = status(g);
      head.appendChild(el("span", "pbadge g-status is-" + st.tone, st.text));
      row.appendChild(head);

      var bits = [];
      if (g.client) bits.push(g.client);
      if (g.photos) bits.push(plural(g.photos, "photo"));
      if (g.videos) bits.push(plural(g.videos, "video"));
      if (g.files) bits.push(plural(g.files, "file"));
      bits.push(human(g.bytes || 0));
      if (g.downloads) bits.push(plural(g.downloads, "download"));
      if (g.reviews) bits.push(plural(g.reviews, "review"));
      row.appendChild(el("p", "g-meta", bits.join(" · ")));

      var link = linkFor(g.title, g.id);
      var acts = el("div", "g-actions");
      acts.appendChild(btn("Copy link", function (b) { return copy(link, b); }, "is-primary"));
      var open = el("a", "link-quiet g-act", "Open");
      open.href = link; open.target = "_blank"; open.rel = "noopener";
      acts.appendChild(open);
      acts.appendChild(btn("Add files", async function () { startAdding(await getManifest(g.id)); }));
      acts.appendChild(btn(g.clientId ? "Change client" : "Set client", async function () {
        var man = await getManifest(g.id);
        var picked = await askClient(man);
        if (!picked) return;
        man.clientId = picked.client ? picked.client.id : "";
        man.client = picked.client ? picked.client.name : "";
        await putManifest(man);
        flash(picked.client ? "Linked to " + picked.client.name + "." : "Client removed.");
        loadList();
      }));
      acts.appendChild(btn("Note", async function () {
        var man = await getManifest(g.id);
        var text = await ask("Note to the client", "Shown under the title. Leave it empty to remove it.", "Save", true, man.message || "");
        if (text === null) return;
        man.message = text.trim();
        await putManifest(man);
        flash(man.message ? "Note saved." : "Note removed.");
      }));
      acts.appendChild(g.locked
        ? btn("Unlock downloads", function () { return change(g.id, function (m) { m.locked = false; }, "Downloads are open."); })
        : btn("Lock downloads", function () { return change(g.id, function (m) { m.locked = true; }, "Downloads locked; previews still show."); }));
      acts.appendChild(btn("Extend 90 days", function () {
        return change(g.id, function (m) { m.expires = new Date(Date.now() + 90 * 86400000).toISOString(); }, "Online for another 90 days.");
      }));
      acts.appendChild(g.keep
        ? btn("Stop keeping", function () { return change(g.id, function (m) { m.keep = false; }, "Files will be deleted 90 days after the link expires."); })
        : btn("Keep files", function () { return change(g.id, function (m) { m.keep = true; }, "Files kept for good. The link still expires on its date."); }));
      if (!(g.expires && Date.parse(g.expires) <= Date.now())) {
        acts.appendChild(btn("Switch off", async function () {
          if (await ask("Switch this gallery off?", "The link stops working now. Files are deleted in " + GRACE_DAYS + " days unless you extend it.", "Switch off")) {
            await change(g.id, function (m) { m.expires = new Date().toISOString(); }, "Switched off.");
          }
        }));
      }
      acts.appendChild(btn("Delete", async function () {
        if (await ask("Delete \"" + (g.title || "this gallery") + "\"?", "Its files are removed for good and the link stops working. This can't be undone.", "Delete for good")) {
          await api("DELETE", "/admin/g/" + g.id);
          flash("Deleted.");
          loadList();
        }
      }, "is-danger"));
      row.appendChild(acts);
      list.appendChild(row);
    });
  }

  /* ---------- clients: every gallery belongs to a portal client ---------- */

  var clients = [];

  function fillClients(select, selectedId) {
    select.textContent = "";
    var none = el("option", null, "No client yet");
    none.value = "";
    select.appendChild(none);
    clients.slice().sort(function (a, b) { return natural(a.name || "", b.name || ""); }).forEach(function (c) {
      var o = el("option", null, c.name + (c.contactName && c.contactName !== c.name ? " (" + c.contactName + ")" : ""));
      o.value = c.id;
      select.appendChild(o);
    });
    var add = el("option", null, "+ New client…");
    add.value = "__new";
    select.appendChild(add);
    select.value = selectedId && clients.some(function (c) { return c.id === selectedId; }) ? selectedId : "";
  }

  async function loadClients() {
    try { clients = (window.PortalStore && (await PortalStore.getClients())) || []; }
    catch (e) { clients = []; }
    fillClients($("g-client"), "");
  }

  /* The chosen client, creating it first if "+ New client" was picked.
     Only a name is needed; email and the rest can be added on the Clients page. */
  async function resolveClient(select, nameIn, emailIn) {
    if (select.value === "__new") {
      var name = (nameIn.value || "").trim();
      if (!name) { nameIn.focus(); throw new Error("Give the new client a name."); }
      var row = await PortalStore.addClient({ name: name, kind: "", contactName: name, email: (emailIn.value || "").trim(), phone: "" });
      clients.push(row);
      return { id: row.id, name: row.name };
    }
    var c = clients.find(function (x) { return x.id === select.value; });
    return c ? { id: c.id, name: c.name } : null;
  }

  $("g-client").addEventListener("change", function () {
    var isNew = this.value === "__new";
    $("g-new-client").hidden = !isNew;
    if (isNew) $("g-nc-name").focus();
  });

  var clientDialog = $("client-dialog");
  function askClient(current) {
    return new Promise(function (resolve) {
      var sel = $("cd-client");
      fillClients(sel, current.clientId);
      $("cd-new").hidden = true;
      $("cd-nc-name").value = current.client && !current.clientId ? current.client : "";
      $("cd-nc-email").value = "";
      $("cd-msg").hidden = true;
      if (!current.clientId && current.client && !clients.some(function (c) { return c.name === current.client; })) {
        sel.value = "__new";                    // an old free-text client: offer it as the new client's name
        $("cd-new").hidden = false;
      }
      sel.onchange = function () { $("cd-new").hidden = sel.value !== "__new"; if (sel.value === "__new") $("cd-nc-name").focus(); };
      $("cd-cancel").onclick = function () { clientDialog.close(); resolve(null); };
      $("cd-ok").onclick = async function () {
        $("cd-ok").disabled = true;
        try {
          var c = await resolveClient(sel, $("cd-nc-name"), $("cd-nc-email"));
          clientDialog.close();
          resolve({ client: c });
        } catch (err) {
          $("cd-msg").textContent = err.message || String(err);
          $("cd-msg").hidden = false;
        }
        $("cd-ok").disabled = false;
      };
      clientDialog.showModal();
    });
  }

  loadClients();

  // Local testing only: lets a test drive the form without a real drag and drop
  if (LOCAL) window.__galleries = { setPicked: setPicked, normalise: normalise, groupsOf: groupsOf, loadList: loadList };

  loadList();
})();
