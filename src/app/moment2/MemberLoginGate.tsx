"use client";

import { useEffect } from "react";

const LOGIN_BUTTON_TEXT = "INVIA LINK DI ACCESSO";
const CTA_ID = "lv-non-member-login-cta";

function removeExistingCta(form: HTMLFormElement) {
  form.querySelector(`#${CTA_ID}`)?.remove();
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

  const submitButton = Array.from(form.querySelectorAll("button")).find(
    (button) => button.textContent?.trim().toUpperCase() === LOGIN_BUTTON_TEXT,
  );
  submitButton?.insertAdjacentElement("beforebegin", box);
}

function isHomepageLoginForm(form: HTMLFormElement) {
  const emailInput = form.querySelector<HTMLInputElement>('input[type="email"]');
  if (!emailInput) return false;
  return Array.from(form.querySelectorAll("button")).some(
    (button) => button.textContent?.trim().toUpperCase() === LOGIN_BUTTON_TEXT,
  );
}

export default function MemberLoginGate() {
  useEffect(() => {
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

      try {
        const response = await fetch("/api/public/member-login-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok) {
          form.dataset.lvMemberCheck = "passed";
          form.requestSubmit();
          return;
        }

        if (!result.allowed) {
          showNonMemberCta(form);
          return;
        }

        form.dataset.lvMemberCheck = "passed";
        form.requestSubmit();
      } catch {
        form.dataset.lvMemberCheck = "passed";
        form.requestSubmit();
      }
    };

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}
