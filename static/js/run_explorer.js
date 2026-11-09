/* WatchDog project page: Run Explorer, figure placeholders, result tabs, BibTeX copy.
 * Dependency free. Every URL is relative so the page works under /WatchDog/.
 */
(function () {
  "use strict";

  var MANIFEST_URL = "static/runs/manifest.json";

  // Option text for the scenario dropdown, in the paper's wording.
  var SCENARIO_TEXT = {
    S1: "S1: library monitors only",
    S2: "S2: library or authored monitors, or both",
    S3: "S3: authored monitors only",
    S4: "S4: no WatchDog, executor monitors itself"
  };
  // WatchDog wakes hidden from the event log unless "Show all WatchDog wakes" is ticked.
  var NOISY_WAKE = /^wake:\s*(skill_start|skill_end|phase)\b/;
  var LANE_NAME = { executor: "Executor", bus: "Bus", monitors: "Monitor", watchdog: "WatchDog" };

  function $(id) { return document.getElementById(id); }

  // ------------------------------------------------------------------
  // Missing figures become a labelled box, never a blank area or a dead link
  // ------------------------------------------------------------------

  function missingBox(text) {
    var div = document.createElement("div");
    div.className = "media-missing";
    div.textContent = text || "Media not available yet.";
    return div;
  }

  function initPlaceholders() {
    var imgs = document.querySelectorAll("img.placeholder-img");
    Array.prototype.forEach.call(imgs, function (img) {
      var swap = function () {
        // Figures are wrapped in a link to the full size image; replace the link too.
        var target = img.parentNode && img.parentNode.tagName === "A" ? img.parentNode : img;
        if (target.parentNode) { target.parentNode.replaceChild(missingBox(img.getAttribute("data-placeholder")), target); }
      };
      if (img.complete && img.naturalWidth === 0) { swap(); } else { img.addEventListener("error", swap); }
    });
  }

  // ------------------------------------------------------------------
  // Tab groups (result tables, example run figures). Without JavaScript
  // every panel stays stacked and visible.
  // ------------------------------------------------------------------

  function initTabs() {
    Array.prototype.forEach.call(document.querySelectorAll(".js-tabs"), initTabGroup);
  }

  function initTabGroup(tabs) {
    var links = tabs.querySelectorAll("a[data-panel]");
    if (!links.length) { return; }
    var show = function (id) {
      Array.prototype.forEach.call(links, function (a) {
        var on = a.getAttribute("data-panel") === id;
        a.parentNode.classList.toggle("is-active", on);
        a.setAttribute("aria-selected", on ? "true" : "false");
        var panel = $(a.getAttribute("data-panel"));
        if (panel) { panel.classList.toggle("is-hidden", !on); }
      });
    };
    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        show(a.getAttribute("data-panel"));
      });
    });
    tabs.classList.remove("is-hidden");
    var fromHash = location.hash && tabs.querySelector("a[data-panel='" + location.hash.slice(1) + "']");
    show(fromHash ? location.hash.slice(1) : links[0].getAttribute("data-panel"));
  }

  // ------------------------------------------------------------------
  // Theater view for the Run Explorer video
  // ------------------------------------------------------------------

  function initTheater() {
    var btn = $("theater-btn");
    var wrap = $("video-wrap");
    if (!btn || !wrap) { return; }
    btn.addEventListener("click", function () {
      var on = !wrap.classList.contains("is-theater");
      wrap.classList.toggle("is-theater", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-dark", on);
      btn.querySelector("i").className = on ? "fas fa-compress" : "fas fa-expand";
      btn.querySelector("span:last-child").textContent = on ? "Exit theater" : "Theater";
      wrap.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  // ------------------------------------------------------------------
  // BibTeX copy
  // ------------------------------------------------------------------

  function initCopy() {
    var btn = $("copy-bibtex");
    var pre = $("bibtex");
    if (!btn || !pre) { return; }
    btn.addEventListener("click", function () {
      var text = pre.textContent;
      var done = function () {
        var label = btn.querySelector("span:last-child");
        var old = label.textContent;
        label.textContent = "Copied";
        setTimeout(function () { label.textContent = old; }, 1500);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else {
        fallbackCopy(text);
        done();
      }
    });
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nothing else to try */ }
    document.body.removeChild(ta);
  }

  // ------------------------------------------------------------------
  // Run Explorer
  // ------------------------------------------------------------------

  var DIMS = [
    { key: "assembly", el: "sel-assembly", value: function (r) { return r.assembly == null ? "unknown" : String(r.assembly); },
      text: function (v) { return v; } },
    { key: "scenario", el: "sel-scenario", value: function (r) { return r.scenario == null ? "unknown" : String(r.scenario); },
      text: function (v) { return SCENARIO_TEXT[v] || v; } },
    { key: "fault_class", el: "sel-class", value: function (r) { return r.fault_class == null || r.fault_class === "" ? "none" : String(r.fault_class); },
      text: function (v) { return v === "none" ? "None" : /^\d+$/.test(v) ? "Class " + v : v; } },
    { key: "trial", el: "sel-trial", value: function (r) { return r.trial == null ? "1" : String(r.trial); },
      text: function (v) { return "Trial " + v; } }
  ];

  // items[i] is the list row for events[i], or null when that event is filtered out.
  var state = { runs: [], sel: {}, run: null, events: [], items: [], current: -1, selected: -1, hasVideo: false, showAllWakes: false };

  function isVisible(ev) {
    return state.showAllWakes || !(ev.kind === "wake" && NOISY_WAKE.test(ev.label || ""));
  }

  function message(text, isError) {
    var box = $("explorer-message");
    box.textContent = text;
    box.classList.remove("is-hidden");
    box.classList.toggle("is-danger", !!isError);
    box.classList.toggle("is-info", !isError);
  }

  function clearMessage() { $("explorer-message").classList.add("is-hidden"); }

  function matches(run, sel, skipKey) {
    return DIMS.every(function (d) {
      return d.key === skipKey || sel[d.key] === undefined || d.value(run) === sel[d.key];
    });
  }

  function distinct(dim) {
    var seen = {};
    state.runs.forEach(function (r) { seen[dim.value(r)] = true; });
    return Object.keys(seen).sort(function (a, b) {
      var na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) { return na - nb; }
      if (a === "none") { return -1; }
      if (b === "none") { return 1; }
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function renderSelects() {
    DIMS.forEach(function (d) {
      var el = $(d.el);
      el.textContent = "";
      distinct(d).forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v;
        opt.textContent = d.text(v);
        var probe = Object.assign({}, state.sel);
        probe[d.key] = v;
        opt.disabled = !state.runs.some(function (r) { return matches(r, probe); });
        if (opt.disabled) { opt.textContent += " (no run)"; }
        el.appendChild(opt);
      });
      el.value = state.sel[d.key];
    });
  }

  function adoptRun(run) {
    DIMS.forEach(function (d) { state.sel[d.key] = d.value(run); });
  }

  function onSelectChange(dim) {
    state.sel[dim.key] = $(dim.el).value;
    var exact = state.runs.filter(function (r) { return matches(r, state.sel); });
    if (!exact.length) {
      // keep the value just chosen; take the run that agrees with the most other selections
      var cands = state.runs.filter(function (r) { return dim.value(r) === state.sel[dim.key]; });
      cands.sort(function (a, b) { return score(b) - score(a); });
      if (cands.length) { adoptRun(cands[0]); }
    }
    renderSelects();
    loadSelected();
  }

  function score(run) {
    return DIMS.reduce(function (n, d) { return n + (d.value(run) === state.sel[d.key] ? 1 : 0); }, 0);
  }

  function fmt(t) { return (Math.round(t * 10) / 10).toFixed(1) + " s"; }

  function showVideo(run) {
    var video = $("run-video");
    var ph = $("video-placeholder");
    state.hasVideo = false;
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");
    if (run.poster) { video.setAttribute("poster", run.poster); }
    ph.style.backgroundImage = run.poster ? "url('" + encodeURI(run.poster) + "')" : "";
    if (!run.video) {
      video.classList.add("is-hidden");
      ph.classList.remove("is-hidden");
      return;
    }
    video.classList.remove("is-hidden");
    ph.classList.add("is-hidden");
    video.src = run.video;
    video.load();
    state.hasVideo = true;
  }

  function onVideoError() {
    state.hasVideo = false;
    $("run-video").classList.add("is-hidden");
    $("video-placeholder").classList.remove("is-hidden");
  }

  function renderEvents() {
    var list = $("event-list");
    list.textContent = "";
    state.items = [];
    state.current = -1;
    if (!state.events.length) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "This run has no events to show.";
      list.appendChild(li);
      return;
    }
    state.events.forEach(function (ev, i) {
      if (!isVisible(ev)) { state.items.push(null); return; }
      var li = document.createElement("li");
      li.setAttribute("data-index", String(i));
      li.className = "kind-" + String(ev.kind || "");
      if ((ev.kind === "verdict" || ev.kind === "run_verdict") && /^FAIL/.test(ev.label || "")) { li.className += " verdict-fail"; }
      var chip = document.createElement("span");
      chip.className = "chip lane-" + (LANE_NAME[ev.lane] ? ev.lane : "bus");
      chip.textContent = LANE_NAME[ev.lane] || "Bus";
      var lab = document.createElement("span");
      lab.className = "ev-label";
      lab.textContent = ev.label || ev.kind || "";
      lab.title = ev.label || "";
      var tm = document.createElement("span");
      tm.className = "ev-time";
      tm.textContent = "video " + fmt(ev.t_video) + ", real " + fmt(ev.t_real);
      tm.title = "video time, real session time";
      li.appendChild(chip);
      li.appendChild(lab);
      li.appendChild(tm);
      li.addEventListener("click", function () { selectEvent(i, true); });
      if (i === state.selected) { li.classList.add("is-selected"); }
      list.appendChild(li);
      state.items.push(li);
    });
    onTimeUpdate();
  }

  function selectEvent(i, seek) {
    var ev = state.events[i];
    if (!ev) { return; }
    var items = state.items;
    if (state.selected >= 0 && items[state.selected]) { items[state.selected].classList.remove("is-selected"); }
    state.selected = i;
    if (items[i]) { items[i].classList.add("is-selected"); }
    var box = $("event-detail");
    box.textContent = "";
    var times = document.createElement("div");
    times.className = "times";
    times.textContent = "video " + fmt(ev.t_video) + ", real session " + fmt(ev.t_real) + ", " +
      (LANE_NAME[ev.lane] || ev.lane) + " lane, " + ev.kind;
    var label = document.createElement("div");
    label.className = "label-line";
    label.textContent = ev.label || "";
    var detail = document.createElement("div");
    detail.textContent = ev.detail || "";
    box.appendChild(times);
    box.appendChild(label);
    box.appendChild(detail);
    if (seek && state.hasVideo) {
      var video = $("run-video");
      try { video.currentTime = Math.max(0, Number(ev.t_video) || 0); } catch (e) { /* not seekable yet */ }
    }
  }

  function onTimeUpdate() {
    var t = $("run-video").currentTime + 0.05;
    var idx = -1;
    // Highlight the latest visible event at or before the playhead.
    for (var i = 0; i < state.events.length; i++) {
      if (state.events[i].t_video <= t) { if (state.items[i]) { idx = i; } } else { break; }
    }
    if (idx === state.current) { return; }
    var items = state.items;
    if (state.current >= 0 && items[state.current]) { items[state.current].classList.remove("is-current"); }
    state.current = idx;
    if (idx >= 0 && items[idx]) {
      items[idx].classList.add("is-current");
      scrollIntoList(items[idx]);
    }
  }

  function scrollIntoList(li) {
    // Scroll the list only, never the page. The list is position: relative,
    // so li.offsetTop is already measured from the list's top edge.
    var list = $("event-list");
    var top = li.offsetTop;
    if (top < list.scrollTop || top + li.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 2);
    }
  }

  function loadSelected() {
    var run = state.runs.filter(function (r) { return matches(r, state.sel); })[0];
    state.run = run || null;
    state.events = [];
    state.current = -1;
    state.selected = -1;
    $("event-detail").innerHTML = "<p class=\"has-text-grey\">Select an event to see its details.</p>";
    if (!run) {
      message("No run matches this selection.", false);
      renderEvents();
      return;
    }
    $("run-title").textContent = run.title || run.run_id;
    $("run-subtitle").textContent = run.subtitle || "";
    $("run-agents").textContent = run.agents || "";
    showVideo(run);
    if (!run.json) {
      message("This run has no event log yet.", false);
      renderEvents();
      return;
    }
    fetch(run.json, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) { throw new Error("HTTP " + res.status); }
        return res.json();
      })
      .then(function (data) {
        if (state.run !== run) { return; }  // a newer selection won
        state.events = (data.events || []).slice().sort(function (a, b) { return a.t_video - b.t_video; });
        clearMessage();
        renderEvents();
      })
      .catch(function (err) {
        if (state.run !== run) { return; }
        message("Could not load the event log for this run (" + err.message + ").", true);
        renderEvents();
      });
  }

  function initExplorer() {
    if (!$("run-explorer")) { return; }
    var video = $("run-video");
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("error", onVideoError);
    var wakes = $("show-all-wakes");
    if (wakes) {
      wakes.checked = false;
      wakes.addEventListener("change", function () {
        state.showAllWakes = wakes.checked;
        renderEvents();
      });
    }
    DIMS.forEach(function (d) {
      $(d.el).addEventListener("change", function () { onSelectChange(d); });
    });
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) { throw new Error("HTTP " + res.status); }
        return res.json();
      })
      .then(function (manifest) {
        var runs = (manifest && manifest.runs) || [];
        if (!runs.length) {
          message("No runs have been published yet. Check back soon.", false);
          $("explorer-body").classList.add("is-hidden");
          return;
        }
        state.runs = runs;
        adoptRun(runs[0]);
        renderSelects();
        loadSelected();
      })
      .catch(function (err) {
        var hint = location.protocol === "file:" ?
          " This page reads its data over HTTP; serve the folder with a local web server instead of opening the file directly." : "";
        message("The run list could not be loaded (" + err.message + ")." + hint, true);
        $("explorer-body").classList.add("is-hidden");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initPlaceholders();
    initTabs();
    initCopy();
    initTheater();
    initExplorer();
  });
}());
