/* Oakline Digital — site interactions. No dependencies. */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
   * CONFIGURATION
   * FORM_ENDPOINT: a URL that accepts a JSON POST (for example a Formspree
   *   form endpoint, or your own serverless function). While this is empty,
   *   the enquiry form validates normally but does NOT send anything, and it
   *   tells the visitor so.
   * CONTACT_EMAIL: shown in the footer once you have a confirmed, working
   *   mailbox. Leave empty to hide it.
   * ------------------------------------------------------------------ */
  var FORM_ENDPOINT = "";
  var CONTACT_EMAIL = "";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Year + optional email ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
  if (CONTACT_EMAIL) {
    document.querySelectorAll("[data-contact-email]").forEach(function (el) {
      el.textContent = CONTACT_EMAIL;
      el.hidden = false;
    });
  }

  /* ---------- Header: scrolled state ---------- */
  var header = document.querySelector("[data-header]");
  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  var toggle = document.querySelector("[data-menu-toggle]");
  var menu = document.querySelector("[data-menu]");
  function setMenu(open, returnFocus) {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    header.classList.toggle("menu-open", open);
    if (open) {
      var first = menu.querySelector("a");
      if (first) first.focus();
    } else if (returnFocus) {
      toggle.focus();
    }
  }
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true", false);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false, false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true")
        setMenu(false, true);
    });
    window.matchMedia("(min-width: 961px)").addEventListener("change", function (mq) {
      if (mq.matches) setMenu(false, false);
    });
  }

  /* ---------- Active nav link ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
  if ("IntersectionObserver" in window && navLinks.length) {
    var sections = navLinks
      .map(function (a) {
        return document.querySelector(a.getAttribute("href"));
      })
      .filter(Boolean);
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (a) {
            var match = a.getAttribute("href") === "#" + entry.target.id;
            if (match) a.setAttribute("aria-current", "true");
            else a.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach(function (s) {
      navObserver.observe(s);
    });
  }

  /* ---------- Hero parallax (fine pointers only) ---------- */
  var stage = document.querySelector(".stage");
  if (stage && !reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    var hero = document.querySelector(".hero");
    var frame = 0;
    hero.addEventListener("pointermove", function (e) {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0;
        var r = hero.getBoundingClientRect();
        stage.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        stage.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    });
    hero.addEventListener("pointerleave", function () {
      stage.style.setProperty("--px", "0");
      stage.style.setProperty("--py", "0");
    });
  }

  /* ---------- Complete-picture diagram ---------- */
  var NODE_COPY = {
    website: {
      kicker: "Your home base",
      title: "Website",
      body: "The one place online that you fully control. Your menu, prices, services, photos and contact details live here, and everything else points back to it.",
      links: "social profiles, your Google listing and every ad we run.",
    },
    local: {
      kicker: "How nearby customers find you",
      title: "Local search",
      body: "Your Google Business Profile puts you on the map when someone nearby searches for what you do, with your hours, photos and a button for directions.",
      links: "your website for details, and local ads that appear in the same searches.",
    },
    ads: {
      kicker: "Reaching new people",
      title: "Advertising",
      body: "Ads introduce you to local people who don’t know you yet, on a budget you set. They work best when they lead somewhere that looks good.",
      links: "your website, your social pages and your Google listing.",
    },
    social: {
      kicker: "Where people get to know you",
      title: "Social",
      body: "Regular posts show that you are open, active and good at what you do. Social pages build familiarity, so people think of you first.",
      links: "your website for bookings and orders, and ads that reach beyond your followers.",
    },
    brand: {
      kicker: "What ties it together",
      title: "Branding",
      body: "The same logo, colours and tone of voice everywhere. When every piece looks like one business, customers recognise you and trust you sooner.",
      links: "everything, which is why it runs all the way around the circle.",
    },
  };
  var diagram = document.querySelector("[data-diagram]");
  var panel = document.querySelector("[data-panel]");
  if (diagram && panel) {
    var nodes = Array.prototype.slice.call(diagram.querySelectorAll("[data-node]"));
    var links = Array.prototype.slice.call(diagram.querySelectorAll("[data-link]"));
    var kickerEl = panel.querySelector("[data-panel-kicker]");
    var titleEl = panel.querySelector("[data-panel-title]");
    var bodyEl = panel.querySelector("[data-panel-body]");
    var linksEl = panel.querySelector("[data-panel-links]");

    var select = function (key, focus) {
      var copy = NODE_COPY[key];
      if (!copy) return;
      diagram.setAttribute("data-active", key);
      nodes.forEach(function (n) {
        var on = n.getAttribute("data-node") === key;
        n.setAttribute("aria-selected", String(on));
        n.tabIndex = on ? 0 : -1;
        if (on) {
          panel.setAttribute("aria-labelledby", n.id);
          if (focus) n.focus();
        }
      });
      links.forEach(function (l) {
        var keys = l.getAttribute("data-link").split(" ");
        l.classList.toggle("is-active", key === "brand" ? false : keys.indexOf(key) !== -1);
      });
      var swap = function () {
        kickerEl.textContent = copy.kicker;
        titleEl.textContent = copy.title;
        bodyEl.textContent = copy.body;
        linksEl.innerHTML = "";
        var label = document.createElement("span");
        label.textContent = "Connects to";
        linksEl.appendChild(label);
        linksEl.appendChild(document.createTextNode(" " + copy.links));
      };
      if (reduceMotion) {
        swap();
      } else {
        panel.classList.add("is-swapping");
        setTimeout(function () {
          swap();
          panel.classList.remove("is-swapping");
        }, 180);
      }
    };

    nodes.forEach(function (n, i) {
      n.addEventListener("click", function () {
        select(n.getAttribute("data-node"), false);
      });
      n.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = nodes[(i + 1) % nodes.length];
        if (e.key === "ArrowLeft" || e.key === "ArrowUp")
          next = nodes[(i - 1 + nodes.length) % nodes.length];
        if (e.key === "Home") next = nodes[0];
        if (e.key === "End") next = nodes[nodes.length - 1];
        if (next) {
          e.preventDefault();
          select(next.getAttribute("data-node"), true);
        }
      });
    });
    // Initial highlight without animation
    links.forEach(function (l) {
      l.classList.toggle(
        "is-active",
        l.getAttribute("data-link").split(" ").indexOf("website") !== -1,
      );
    });
    diagram.setAttribute("data-active", "website");
  }

  /* ---------- Accordion ---------- */
  document.querySelectorAll("[data-accordion] .acc-trigger").forEach(function (btn) {
    var panelEl = document.getElementById(btn.getAttribute("aria-controls"));
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      if (open) {
        panelEl.classList.remove("is-open");
        var done = function () {
          if (btn.getAttribute("aria-expanded") === "false") panelEl.hidden = true;
        };
        if (reduceMotion) done();
        else setTimeout(done, 400);
      } else {
        panelEl.hidden = false;
        // next frame so the grid-row transition runs
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            panelEl.classList.add("is-open");
          });
        });
      }
    });
  });

  /* ---------- "Ask about this" links pre-select a service ---------- */
  document.querySelectorAll("[data-service]").forEach(function (link) {
    link.addEventListener("click", function () {
      var value = link.getAttribute("data-service");
      var box = document.querySelector('input[name="services"][value="' + value + '"]');
      if (box) box.checked = true;
    });
  });

  /* ---------- Enquiry form ---------- */
  var form = document.querySelector("[data-form]");
  if (!form) return;

  var summary = form.querySelector("[data-error-summary]");
  var summaryList = form.querySelector("[data-error-list]");
  var result = form.querySelector("[data-result]");
  var submitBtn = form.querySelector("[data-submit]");
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^[+()\d\s-]{7,20}$/;

  var rules = [
    {
      id: "f-name",
      test: function (v) {
        return v.trim().length > 1;
      },
      msg: "Enter your name.",
    },
    {
      id: "f-business",
      test: function (v) {
        return v.trim().length > 1;
      },
      msg: "Enter your business name.",
    },
    {
      id: "f-email",
      test: function (v) {
        return EMAIL_RE.test(v.trim());
      },
      msg: "Enter an email address, like name@yourbusiness.co.uk.",
    },
    {
      id: "f-phone",
      test: function (v) {
        return v.trim() === "" || PHONE_RE.test(v.trim());
      },
      msg: "Enter a phone number using digits, or leave it blank.",
    },
    {
      id: "f-message",
      test: function (v) {
        return v.trim().length >= 10;
      },
      msg: "Tell us a little about what you need (at least a sentence).",
    },
  ];

  function setFieldError(input, errEl, msg) {
    if (msg) {
      input.setAttribute("aria-invalid", "true");
      errEl.textContent = msg;
      errEl.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      errEl.textContent = "";
      errEl.hidden = true;
    }
  }

  function validateRule(rule) {
    var input = document.getElementById(rule.id);
    var ok = rule.test(input.value);
    setFieldError(input, document.getElementById(rule.id + "-err"), ok ? "" : rule.msg);
    return ok;
  }

  function selectedServices() {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="services"]:checked'))
      .map(function (b) {
        return b.value;
      });
  }

  function validateServices() {
    var err = document.getElementById("f-services-err");
    var ok = selectedServices().length > 0;
    err.textContent = ok ? "" : "Choose at least one option. “Not sure yet” is fine.";
    err.hidden = ok;
    return ok;
  }

  // Re-validate a field once the visitor has left it (only after a first error)
  rules.forEach(function (rule) {
    var input = document.getElementById(rule.id);
    input.addEventListener("blur", function () {
      if (input.getAttribute("aria-invalid") === "true" || (input.value && rule.id === "f-email")) {
        validateRule(rule);
      }
    });
    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true") validateRule(rule);
    });
  });
  form.querySelectorAll('input[name="services"]').forEach(function (b) {
    b.addEventListener("change", function () {
      if (!document.getElementById("f-services-err").hidden) validateServices();
    });
  });

  function showResult(html, isError) {
    result.innerHTML = html;
    result.classList.toggle("is-error", !!isError);
    result.hidden = false;
    result.focus({ preventScroll: true });
    result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    result.hidden = true;

    var errors = [];
    rules.forEach(function (rule) {
      if (!validateRule(rule)) errors.push({ id: rule.id, msg: rule.msg });
    });
    if (!validateServices())
      errors.push({ id: "s-web", msg: "Choose at least one service option." });

    if (errors.length) {
      summaryList.innerHTML = "";
      errors.forEach(function (err) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#" + err.id;
        a.textContent = err.msg;
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          document.getElementById(err.id).focus();
        });
        li.appendChild(a);
        summaryList.appendChild(li);
      });
      summary.hidden = false;
      summary.focus();
      return;
    }
    summary.hidden = true;

    var data = {
      name: document.getElementById("f-name").value.trim(),
      email: document.getElementById("f-email").value.trim(),
      business: document.getElementById("f-business").value.trim(),
      phone: document.getElementById("f-phone").value.trim(),
      services: selectedServices(),
      message: document.getElementById("f-message").value.trim(),
    };

    if (!FORM_ENDPOINT) {
      // No backend connected: be explicit that nothing was sent.
      var text =
        "Name: " +
        data.name +
        "\nBusiness: " +
        data.business +
        "\nEmail: " +
        data.email +
        (data.phone ? "\nPhone: " + data.phone : "") +
        "\nInterested in: " +
        data.services.join(", ") +
        "\n\n" +
        data.message;
      showResult(
        "<h3>Your enquiry has not been sent yet</h3>" +
          "<p>This form isn’t connected to an inbox yet, so nothing has left your browser. " +
          "You can copy your message below and keep it for when enquiries open.</p>" +
          "<pre data-copy-text>" +
          escapeHtml(text) +
          "</pre>" +
          '<button type="button" class="btn btn-dark" data-copy>Copy my message</button>',
        true,
      );
      var copyBtn = result.querySelector("[data-copy]");
      copyBtn.addEventListener("click", function () {
        var pre = result.querySelector("[data-copy-text]");
        var selectFallback = function () {
          var range = document.createRange();
          range.selectNodeContents(pre);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          copyBtn.textContent = "Text selected, press Ctrl/Cmd + C";
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            copyBtn.textContent = "Copied";
          }, selectFallback);
        } else {
          selectFallback();
        }
      });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        form.reset();
        showResult(
          "<h3>Thank you, " +
            escapeHtml(data.name.split(" ")[0]) +
            ".</h3>" +
            "<p>Your enquiry has been sent. We’ll read it properly and reply to " +
            escapeHtml(data.email) +
            " with next steps.</p>",
          false,
        );
      })
      .catch(function () {
        showResult(
          "<h3>That didn’t send</h3>" +
            "<p>Something went wrong on our side and your enquiry was not delivered. " +
            "Your details are still in the form, so please try again in a moment.</p>",
          true,
        );
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send enquiry";
      });
  });
})();
