"use client";

import { useEffect } from "react";

const LOGIN_BUTTON_TEXT = "INVIA LINK DI ACCESSO";
const CTA_ID = "lv-non-member-login-cta";
const ERROR_ID = "lv-member-login-error";
const CHALLENGE_ID = "lv-member-login-turnstile";
const CHECKING_BUTTON_TEXT = "VERIFICA IN CORSO…";
const BLOCKED_BUTTON_TEXT = "EMAIL NON ASSOCIATA";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

function getTurnstile() {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

function findSubmitButton(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll("button")).find(
    (button) =>
      button.dataset.lvLoginSubmit === "true" ||
      button.textContent?.trim().toUpperCase() === LOGIN_BUTTON_TEXT,
  );
}

function setSubmitState(form: HTMLFormElement, state: "idle" | "checking" | "blocked") {
  const button = findSubmitButton(form) || form.querySelector<HTMLButtonElement>('button[data-lv-login-submit="true"]');
  if (!button) return;
  button.dataset.lvLoginSubmit = "true";
  button.dataset.lvLoginState = state;
  button.disabled = state !== "idle";
  button.textContent =
    state === "checking"
      ? CHECKING_BUTTON_TEXT
      : state === "blocked"
        ? BLOCKED_BUTTON_TEXT
        : LOGIN_BUTTON_TEXT;
}

function removeExistingCta(form: HTMLFormElement) {
  form.querySelector(`#${CTA_ID}`)?.remove();
  form.querySelector(`#${ERROR_ID}`)?.remove();
}

function showGateError(form: HTMLFormElement, message: string) {
  removeExistingCta(form);
  const box = document.createElement("div");
  box.id = ERROR_ID;
  box.textContent = message;
  box.style.marginTop = "12px";
  box.style.padding = "10px 12px";
  box.style.borderRadius = "12px";
  box.style.border = "1px solid rgba(255,90,90,.30)";
  box.style.background = "rgba(255,90,90,.10)";
  box.style.color = "white";
  box.style.fontSize = "13px";
  findSubmitButton(form)?.insertAdjacentElement("beforebegin", box);
}

function showNonMemberCta(form: HTMLFormElement) {
  removeExistingCta(form);

  const box = document.createElement("div");
  box.id = CTA_ID;
  box.style.marginTop = "12px";
  box.style.padding = "12px";
  box.style.borderRadius = "12px";
  box.style.border = "1px solid rgba(255,180,40,.32)";
  box.style.background = "rgba(255,180,40,.10)";
  box.style.color = "white";

  const message = document.createElement("div");
  message.textContent = "Questa email non risulta associata a un socio LEDVELVET.";
  message.style.fontSize = "13px";
  message.style.lineHeight = "1.45";

  const link = document.createElement("a");
  link.href = "/become-member";
  link.textContent = "UNISCITI A LV PEOPLE";
  link.style.display = "inline-flex";
  link.style.marginTop = "10px";
  link.style.borderRadius = "999px";
  link.style.padding = "10px 14px";
  link.style.background = "#b72b1f";
  link.style.color = "white";
  link.style.fontSize = "11px";
  link.style.fontWeight = "700";
  link.style.letterSpacing = ".14em";
  link.style.textDecoration = "none";

  box.append(message, link);

  findSubmitButton(form)?.insertAdjacentElement("beforebegin", box);
}

function isHomepageLoginForm(form: HTMLFormElement) {
  const emailInput = form.querySelector<HTMLInputElement>('input[type="email"]');
  if (!emailInput) return false;
  return Array.from(form.querySelectorAll("button")).some(
    (button) =>
      button.dataset.lvLoginSubmit === "true" ||
      button.textContent?.trim().toUpperCase() === LOGIN_BUTTON_TEXT,
  );
}

export default function MemberLoginGate() {
  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    let turnstileToken = "";
    let widgetId: string | null = null;
    let widgetContainer: HTMLDivElement | null = null;
    let submitAfterChallenge = false;

    const loadTurnstile = async () => {
      if (getTurnstile()) return getTurnstile();

      let script = document.querySelector<HTMLScriptElement>('script[data-lv-turnstile="true"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.lvTurnstile = "true";
        document.head.appendChild(script);
      }

      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (getTurnstile()) return getTurnstile();
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      return undefined;
    };

    const showChallenge = async (form: HTMLFormElement) => {
      if (!sitekey) {
        showGateError(form, "Verifica anti-bot non disponibile. Riprova più tardi.");
        setSubmitState(form, "idle");
        return;
      }

      let container = form.querySelector<HTMLDivElement>(`#${CHALLENGE_ID}`);
      if (!container) {
        container = document.createElement("div");
        container.id = CHALLENGE_ID;
        container.style.marginTop = "12px";
        container.style.minHeight = "65px";
        findSubmitButton(form)?.insertAdjacentElement("beforebegin", container);
      }

      const turnstile = await loadTurnstile();
      if (!turnstile) {
        showGateError(form, "Verifica anti-bot non disponibile. Riprova più tardi.");
        setSubmitState(form, "idle");
        return;
      }

      if (widgetId && widgetContainer !== container) {
        turnstile.remove(widgetId);
        widgetId = null;
        turnstileToken = "";
      }

      submitAfterChallenge = true;
      if (!widgetId) {
        widgetContainer = container;
        widgetId = turnstile.render(container, {
          sitekey,
          action: "member_login",
          theme: "dark",
          callback: (token: string) => {
            turnstileToken = token;
            if (submitAfterChallenge) {
              submitAfterChallenge = false;
              form.requestSubmit();
            }
          },
          "expired-callback": () => {
            turnstileToken = "";
          },
          "error-callback": () => {
            turnstileToken = "";
            submitAfterChallenge = false;
            showGateError(form, "Verifica anti-bot non riuscita. Riprova.");
            setSubmitState(form, "idle");
          },
        });
      } else {
        turnstile.reset(widgetId);
      }
    };

    const onSubmit = async (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !isHomepageLoginForm(form)) return;

      if (form.dataset.lvMemberCheck === "passed") {
        delete form.dataset.lvMemberCheck;
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      removeExistingCta(form);

      const emailInput = form.querySelector<HTMLInputElement>('input[type="email"]');
      const email = emailInput?.value.trim().toLowerCase() || "";
      if (!email) return;
      setSubmitState(form, "checking");

      if (!turnstileToken) {
        await showChallenge(form);
        return;
      }

      const token = turnstileToken;
      turnstileToken = "";

      try {
        const response = await fetch("/api/public/member-login-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, turnstileToken: token }),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok) {
          showGateError(
            form,
            response.status === 429
              ? "Troppi tentativi. Attendi qualche minuto prima di riprovare."
              : "Verifica socio non disponibile. Riprova più tardi.",
          );
          setSubmitState(form, "idle");
          return;
        }

        if (!result.allowed) {
          showNonMemberCta(form);
          setSubmitState(form, "blocked");
          return;
        }

        setSubmitState(form, "idle");
        form.dataset.lvMemberCheck = "passed";
        form.requestSubmit();
      } catch {
        showGateError(form, "Verifica socio non disponibile. Riprova più tardi.");
        setSubmitState(form, "idle");
      } finally {
        submitAfterChallenge = false;
        if (widgetId) getTurnstile()?.reset(widgetId);
      }
    };

    const onInput = (event: Event) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const form = input?.form;
      if (!input || input.type !== "email" || !form || !isHomepageLoginForm(form)) return;
      const button = form.querySelector<HTMLButtonElement>('button[data-lv-login-submit="true"]');
      if (button?.dataset.lvLoginState === "idle" || !button) return;

      delete form.dataset.lvMemberCheck;
      removeExistingCta(form);
      turnstileToken = "";
      submitAfterChallenge = false;
      if (widgetId) getTurnstile()?.reset(widgetId);
      setSubmitState(form, "idle");
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("input", onInput, true);
      if (widgetId) getTurnstile()?.remove(widgetId);
      widgetContainer = null;
    };
  }, []);

  return null;
}
