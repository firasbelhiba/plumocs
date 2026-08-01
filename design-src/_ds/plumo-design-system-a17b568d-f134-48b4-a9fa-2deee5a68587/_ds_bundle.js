/* @ds-bundle: {"format":3,"namespace":"PlumoDesignSystem_a17b56","components":[{"name":"BlobMark","sourcePath":"components/brand/BlobMark.jsx"},{"name":"ICON_NAMES","sourcePath":"components/brand/Icon.jsx"},{"name":"Icon","sourcePath":"components/brand/Icon.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Pill","sourcePath":"components/core/Pill.jsx"},{"name":"FaqItem","sourcePath":"components/patterns/FaqItem.jsx"},{"name":"FeatureCard","sourcePath":"components/patterns/FeatureCard.jsx"},{"name":"PackCard","sourcePath":"components/patterns/PackCard.jsx"},{"name":"PriceCard","sourcePath":"components/patterns/PriceCard.jsx"},{"name":"TaskItem","sourcePath":"components/patterns/TaskItem.jsx"},{"name":"Toast","sourcePath":"components/patterns/Toast.jsx"},{"name":"WaitlistForm","sourcePath":"components/patterns/WaitlistForm.jsx"}],"sourceHashes":{"components/brand/BlobMark.jsx":"76e50dc33500","components/brand/Icon.jsx":"f58c5543cff7","components/core/Badge.jsx":"35673b649b95","components/core/Button.jsx":"c9b13ca1000f","components/core/Input.jsx":"40b80a1085f8","components/core/Pill.jsx":"5185a7311574","components/patterns/FaqItem.jsx":"89913869bbb9","components/patterns/FeatureCard.jsx":"e40fa07bf1b8","components/patterns/PackCard.jsx":"cd063071e7ee","components/patterns/PriceCard.jsx":"8d5ba8c35ef1","components/patterns/TaskItem.jsx":"b6e85f9e45f0","components/patterns/Toast.jsx":"e867e4d4811b","components/patterns/WaitlistForm.jsx":"52ef1109fa9b","ui_kits/app/app.jsx":"e566065d1107","ui_kits/website/site.jsx":"d068df3aec24"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.PlumoDesignSystem_a17b56 = window.PlumoDesignSystem_a17b56 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/BlobMark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* The canonical blob silhouette — reused at every size, in the nav, footer,
   product sidebar, and as the breathing hero mascot. */
const BLOB_PATH = "M 40 4 C 60 2, 75 18, 73 38 C 81 48, 73 65, 56 66 C 51 76, 32 76, 23 68 C 5 71, -2 52, 8 40 C 0 22, 20 4, 40 4 Z";

/**
 * BlobMark — Plumo's mascot. Two canonical inline moods (happy smile, sleepy rest),
 * a controllable fill (use a pack accent to retint), and an optional 3s breathing loop.
 * For the full eight-expression library, use the shipped SVGs in assets/blobs/.
 */
function BlobMark({
  size = 40,
  mood = "happy",
  fill = "var(--plumo-blue)",
  breathe = false,
  title,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "-5 -10 90 90",
    role: title ? "img" : undefined,
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
    style: {
      transformOrigin: "50% 55%",
      animation: breathe ? "plumo-breathe 3s var(--plumo-ease) infinite" : undefined,
      ...style
    }
  }, rest), breathe && /*#__PURE__*/React.createElement("style", null, `@keyframes plumo-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}`), /*#__PURE__*/React.createElement("path", {
    d: BLOB_PATH,
    fill: fill
  }), mood === "happy" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M 22 34 Q 28 27, 34 34",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3.2",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 46 34 Q 52 27, 58 34",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "3.2",
    strokeLinecap: "round"
  })), mood === "sleepy" && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M 22 34 L 34 34",
    stroke: "#fff",
    strokeWidth: "3.2",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M 46 34 L 58 34",
    stroke: "#fff",
    strokeWidth: "3.2",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("text", {
    x: "62",
    y: "14",
    fontFamily: "Inter",
    fontSize: "12",
    fontWeight: "500",
    fill: "var(--plumo-sky)"
  }, "z"), /*#__PURE__*/React.createElement("text", {
    x: "70",
    y: "22",
    fontFamily: "Inter",
    fontSize: "9",
    fontWeight: "500",
    fill: "var(--plumo-sky)"
  }, "z")));
}
Object.assign(__ds_scope, { BlobMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/BlobMark.jsx", error: String((e && e.message) || e) }); }

// components/brand/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Plumo's custom icon family — 24×24 grid, 1.75px stroke, round caps + joins,
   2px corners, never sharp. Rounded and soft to match the blob. */
const PATHS = {
  home: {
    el: /*#__PURE__*/React.createElement("path", {
      d: "M4 11 L12 4 L20 11 V19 Q20 20 19 20 H15 V14 H9 V20 H5 Q4 20 4 19 Z"
    }),
    join: true
  },
  search: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "10",
      cy: "10",
      r: "6"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M15 15 L20 20"
    }))
  },
  calendar: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "5",
      width: "18",
      height: "16",
      rx: "2"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 10 H21"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M8 3 V7 M16 3 V7"
    })),
    join: true
  },
  bell: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M6 10 Q6 5 12 5 Q18 5 18 10 V14 L20 17 H4 L6 14 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 20 Q12 22 14 20"
    })),
    join: true
  },
  settings: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6"
    })),
    join: true
  },
  profile: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "8",
      r: "4"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M4 20 Q4 14 12 14 Q20 14 20 20"
    }))
  },
  done: {
    el: /*#__PURE__*/React.createElement("path", {
      d: "M5 12 L10 17 L19 7"
    }),
    join: true
  },
  add: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 8 V16 M8 12 H16"
    }))
  },
  rest: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "9"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 9 V15 M14 9 V15"
    }))
  },
  like: {
    el: /*#__PURE__*/React.createElement("path", {
      d: "M12 20 Q4 15 4 9 Q4 5 8 5 Q10.5 5 12 8 Q13.5 5 16 5 Q20 5 20 9 Q20 15 12 20 Z"
    }),
    join: true
  },
  chat: {
    el: /*#__PURE__*/React.createElement("path", {
      d: "M4 6 Q4 4 6 4 H18 Q20 4 20 6 V14 Q20 16 18 16 H10 L6 20 V16 Q4 16 4 14 Z"
    }),
    join: true
  },
  breathe: {
    el: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
      d: "M5 20 Q5 10 12 5 Q19 8 19 15 Q15 19 8 19 Q6 19 5 20 Z"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M5 20 Q9 15 13 12"
    })),
    join: true
  }
};
const ICON_NAMES = Object.keys(PATHS);

/**
 * Icon — Plumo's rounded, outlined icon family. 12 names, currentColor stroke.
 */
function Icon({
  name,
  size = 24,
  color = "currentColor",
  strokeWidth = 1.75,
  style,
  ...rest
}) {
  const def = PATHS[name];
  if (!def) return null;
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: def.join ? "round" : undefined,
    "aria-hidden": "true",
    style: {
      display: "block",
      ...style
    }
  }, rest), def.el);
}
Object.assign(__ds_scope, { ICON_NAMES, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — tiny status pill. "new" style (butter), neutral, or accent.
 * Used inline next to nav items, tabs, and headings.
 */
function Badge({
  children,
  tone = "new",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...base,
      ...TONE[tone],
      ...style
    }
  }, rest), children);
}
const base = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: "var(--plumo-radius-pill)",
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 1.5,
  letterSpacing: "0.2px",
  whiteSpace: "nowrap"
};
const TONE = {
  new: {
    background: "var(--plumo-butter)",
    color: "var(--plumo-on-butter)"
  },
  blue: {
    background: "var(--plumo-mist)",
    color: "var(--plumo-blue)"
  },
  peach: {
    background: "var(--plumo-peach)",
    color: "var(--plumo-on-peach)"
  },
  neutral: {
    background: "var(--plumo-canvas)",
    color: "var(--plumo-muted)",
    boxShadow: "0 0 0 1px var(--plumo-border)"
  }
};
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Plumo Button — pill-shaped, soft-spring press (scale 1.02 hover / 0.98 active).
 * Four variants mirror the brand: primary (blue), soft (mist), ghost, warm (night→peach).
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  arrow = false,
  href,
  disabled = false,
  onClick,
  type = "button",
  style,
  ...rest
}) {
  const cls = `plumo-btn plumo-btn--${variant} plumo-btn--${size}`;
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, children, arrow && /*#__PURE__*/React.createElement("span", {
    className: "plumo-btn__arrow",
    "aria-hidden": "true"
  }, "\u2192"));
  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: size === "sm" ? "9px 16px" : "12px 22px",
    borderRadius: "var(--plumo-radius-pill)",
    fontFamily: "inherit",
    fontSize: size === "sm" ? 14 : 15,
    fontWeight: 500,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
    textDecoration: "none",
    lineHeight: 1.2,
    transition: "transform var(--plumo-dur-default) var(--plumo-ease), background var(--plumo-dur-default) var(--plumo-ease), color var(--plumo-dur-default) var(--plumo-ease), box-shadow var(--plumo-dur-default) var(--plumo-ease)",
    ...VARIANT[variant],
    ...style
  };
  if (href && !disabled) {
    return /*#__PURE__*/React.createElement("a", _extends({
      href: href,
      className: cls,
      style: baseStyle,
      onClick: onClick
    }, rest), inner);
  }
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    style: baseStyle,
    disabled: disabled,
    onClick: onClick
  }, rest), inner);
}
const VARIANT = {
  primary: {
    background: "var(--plumo-blue)",
    color: "var(--plumo-white)"
  },
  soft: {
    background: "var(--plumo-mist)",
    color: "var(--plumo-night)"
  },
  ghost: {
    background: "transparent",
    color: "var(--plumo-dark)"
  },
  warm: {
    background: "var(--plumo-night)",
    color: "var(--plumo-peach)"
  }
};
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — a soft, pill-rounded text field. Focus ring uses the sky glow.
 * Pairs with Button inside hero/waitlist forms, or stands alone.
 */
function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  id,
  name,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({
    id: id,
    name: name,
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: "100%",
      border: "1px solid var(--plumo-border)",
      background: "var(--plumo-white)",
      borderRadius: "var(--plumo-radius-pill)",
      padding: "12px 18px",
      fontFamily: "inherit",
      fontSize: 15,
      color: "var(--plumo-dark)",
      outline: "none",
      transition: "border-color var(--plumo-dur-default) var(--plumo-ease), box-shadow var(--plumo-dur-default) var(--plumo-ease)",
      borderColor: focus ? "var(--plumo-sky)" : "var(--plumo-border)",
      boxShadow: focus ? "0 0 0 4px rgba(96,165,250,0.18)" : "none",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Pill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Pill — a soft rounded tag. Backs the hero eyebrow pill, floating tags, and chips.
 * Optional leading dot (a small butter circle by default) or any icon node.
 */
function Pill({
  children,
  tone = "mist",
  dot = false,
  icon,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...base,
      ...TONE[tone],
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: dotStyle,
    "aria-hidden": "true"
  }, typeof dot === "string" ? dot : ""), icon, children);
}
const base = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 14px",
  borderRadius: "var(--plumo-radius-pill)",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.4,
  whiteSpace: "nowrap"
};
const dotStyle = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "var(--plumo-butter)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  flexShrink: 0
};
const TONE = {
  mist: {
    background: "var(--plumo-mist)",
    color: "var(--plumo-night)"
  },
  peach: {
    background: "var(--plumo-peach)",
    color: "var(--plumo-on-peach)"
  },
  butter: {
    background: "var(--plumo-butter)",
    color: "var(--plumo-on-butter)"
  },
  white: {
    background: "var(--plumo-white)",
    color: "var(--plumo-night)",
    boxShadow: "var(--plumo-shadow-card)"
  }
};
Object.assign(__ds_scope, { Pill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Pill.jsx", error: String((e && e.message) || e) }); }

// components/patterns/FaqItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FaqItem — a soft accordion row. Uses native <details> so it works without JS;
 * the plus chip rotates to an × and the border lights sky when open.
 */
function FaqItem({
  question,
  children,
  defaultOpen = false,
  style,
  ...rest
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return /*#__PURE__*/React.createElement("details", _extends({
    open: open,
    onToggle: e => setOpen(e.currentTarget.open),
    style: {
      background: "var(--plumo-white)",
      border: `1px solid ${open ? "var(--plumo-sky)" : "var(--plumo-border)"}`,
      borderRadius: "var(--plumo-radius-lg)",
      overflow: "hidden",
      transition: "border-color var(--plumo-dur-default) var(--plumo-ease)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("summary", {
    style: {
      listStyle: "none",
      cursor: "pointer",
      padding: "22px 26px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 18,
      fontSize: 17,
      fontWeight: 500,
      letterSpacing: "-0.2px",
      color: "var(--plumo-dark)"
    }
  }, question, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 28,
      height: 28,
      flexShrink: 0,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16,
      background: open ? "var(--plumo-blue)" : "var(--plumo-mist)",
      color: open ? "var(--plumo-white)" : "var(--plumo-blue)",
      transform: open ? "rotate(45deg)" : "none",
      transition: "transform var(--plumo-dur-default) var(--plumo-ease), background var(--plumo-dur-default) var(--plumo-ease)"
    },
    "aria-hidden": "true"
  }, "+")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 26px 24px",
      fontSize: 15,
      lineHeight: 1.65,
      color: "var(--plumo-muted)"
    }
  }, children));
}
Object.assign(__ds_scope, { FaqItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/FaqItem.jsx", error: String((e && e.message) || e) }); }

// components/patterns/FeatureCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * FeatureCard — a soft, rounded feature tile. Three tints (mist / peach / butter)
 * lift on hover (-4px). Icon sits in a contrast chip; footer is a quiet link.
 */
function FeatureCard({
  icon,
  title,
  children,
  footer,
  tone = "mist",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const t = TONE[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: t.bg,
      borderRadius: "var(--plumo-radius-xl)",
      padding: "36px 32px 32px",
      transition: "transform var(--plumo-dur-default) var(--plumo-ease)",
      transform: hover ? "translateY(-4px)" : "none",
      ...style
    }
  }, rest), icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: "var(--plumo-radius-md)",
      background: t.chip,
      color: t.chipColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24
    }
  }, icon), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: "-0.4px",
      margin: "0 0 10px",
      color: t.title
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.6,
      margin: 0,
      color: t.body
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22,
      fontSize: 13,
      fontWeight: 500,
      color: t.footer,
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    }
  }, footer));
}
const TONE = {
  mist: {
    bg: "var(--plumo-mist)",
    chip: "var(--plumo-white)",
    chipColor: "var(--plumo-blue)",
    title: "var(--plumo-night)",
    body: "var(--plumo-muted)",
    footer: "var(--plumo-blue)"
  },
  peach: {
    bg: "#FFF6EC",
    chip: "var(--plumo-peach)",
    chipColor: "var(--plumo-on-peach)",
    title: "#542A14",
    body: "#7A3E1F",
    footer: "var(--plumo-on-peach)"
  },
  butter: {
    bg: "#FFF9E0",
    chip: "var(--plumo-butter)",
    chipColor: "var(--plumo-on-butter)",
    title: "#5C4812",
    body: "var(--plumo-on-butter)",
    footer: "var(--plumo-on-butter)"
  }
};
Object.assign(__ds_scope, { FeatureCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/FeatureCard.jsx", error: String((e && e.message) || e) }); }

// components/patterns/PackCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * PackCard — a "pack" tile (PM / HR / marketing / vault). Each tints the blob with
 * its accent; the arrow on the link slides on hover. Renders as a link.
 */
function PackCard({
  number,
  name,
  suffix,
  tagline,
  link,
  href = "#",
  accent = "var(--plumo-blue)",
  mood = "happy",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 14,
      background: "var(--plumo-white)",
      border: "1px solid var(--plumo-border)",
      borderRadius: "var(--plumo-radius-xl)",
      padding: "28px 26px",
      textDecoration: "none",
      transform: hover ? "translateY(-4px)" : "none",
      boxShadow: hover ? "var(--plumo-shadow-card)" : "none",
      transition: "transform var(--plumo-dur-default) var(--plumo-ease), box-shadow var(--plumo-dur-default) var(--plumo-ease)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      height: 64,
      borderRadius: "50%",
      background: "var(--plumo-mist)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.BlobMark, {
    size: 44,
    fill: accent,
    mood: mood
  })), /*#__PURE__*/React.createElement("div", null, number && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      letterSpacing: "1.5px",
      textTransform: "uppercase",
      opacity: 0.7,
      fontWeight: 500,
      marginBottom: 4,
      color: "var(--plumo-muted)"
    }
  }, number), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: "-0.4px",
      margin: 0,
      color: "var(--plumo-dark)"
    }
  }, "plumo ", suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: accent
    }
  }, suffix))), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      lineHeight: 1.6,
      color: "var(--plumo-muted)",
      margin: 0
    }
  }, tagline), link && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: accent,
      display: "inline-flex",
      alignItems: "center",
      gap: 6
    }
  }, link, " ", /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      transform: hover ? "translateX(3px)" : "none",
      transition: "transform var(--plumo-dur-default) var(--plumo-ease)"
    }
  }, "\u2192")));
}
Object.assign(__ds_scope, { PackCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/PackCard.jsx", error: String((e && e.message) || e) }); }

// components/patterns/PriceCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * PriceCard — a soft pricing tile. Featured variant tints mist + shows a warm
 * butter ribbon ("a little more"). Ticks are round mist chips.
 */
function PriceCard({
  name,
  price,
  unit = "/ month",
  tagline,
  features = [],
  featured = false,
  ribbon = "a little more",
  cta = "start gently",
  ctaHref,
  onCta,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: "relative",
      background: featured ? "var(--plumo-mist)" : "var(--plumo-white)",
      border: `1px solid ${featured ? "var(--plumo-sky)" : "var(--plumo-border)"}`,
      borderRadius: "var(--plumo-radius-xl)",
      padding: "40px 36px",
      display: "flex",
      flexDirection: "column",
      gap: 18,
      transform: hover ? "translateY(-3px)" : "none",
      transition: "transform var(--plumo-dur-default) var(--plumo-ease)",
      ...style
    }
  }, rest), featured && ribbon && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: -12,
      left: 36,
      background: "var(--plumo-butter)",
      color: "var(--plumo-on-butter)",
      padding: "5px 12px",
      borderRadius: "var(--plumo-radius-pill)",
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: "1px",
      textTransform: "uppercase"
    }
  }, ribbon), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 24,
      fontWeight: 500,
      letterSpacing: "-0.5px",
      margin: 0,
      color: "var(--plumo-dark)"
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 52,
      fontWeight: 500,
      letterSpacing: "-2px",
      lineHeight: 1,
      color: "var(--plumo-night)"
    }
  }, price), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--plumo-muted)",
      fontSize: 14
    }
  }, unit)), tagline && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      lineHeight: 1.55,
      color: "var(--plumo-muted)",
      margin: 0
    }
  }, tagline), /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: "none",
      margin: "6px 0 0",
      padding: 0,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, features.map((f, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      fontSize: 14.5,
      color: "var(--plumo-dark)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      flexShrink: 0,
      borderRadius: "50%",
      marginTop: 2,
      background: featured ? "var(--plumo-white)" : "var(--plumo-mist)",
      color: "var(--plumo-blue)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11
    },
    "aria-hidden": "true"
  }, "\u2713"), f))), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: featured ? "primary" : "soft",
    href: ctaHref,
    onClick: onCta,
    style: {
      alignSelf: "flex-start",
      marginTop: 6
    }
  }, cta));
}
Object.assign(__ds_scope, { PriceCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/PriceCard.jsx", error: String((e && e.message) || e) }); }

// components/patterns/TaskItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * TaskItem — a single gentle to-do row. Click toggles done (round check fills blue,
 * text softens + strikes). Optional peach/butter tints for cozy items. No "overdue".
 */
function TaskItem({
  text,
  meta,
  done = false,
  tone = "plain",
  onToggle,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const t = TONE[tone];
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "listitem",
    onClick: onToggle,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      background: t.bg,
      border: `1px solid ${hover && tone === "plain" ? "var(--plumo-sky)" : t.border}`,
      borderRadius: "var(--plumo-radius-md)",
      cursor: "pointer",
      transform: hover ? "translateX(2px)" : "none",
      transition: "all var(--plumo-dur-default) var(--plumo-ease)",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      borderRadius: "50%",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: `1.5px solid ${done ? "var(--plumo-blue)" : t.check}`,
      background: done ? "var(--plumo-blue)" : "transparent",
      transition: "all var(--plumo-dur-default) var(--plumo-ease)"
    },
    "aria-hidden": "true"
  }, done && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--plumo-white)",
      fontSize: 11,
      lineHeight: 1
    }
  }, "\u2713")), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      color: done ? "var(--plumo-muted)" : t.text,
      textDecoration: done ? "line-through" : "none"
    }
  }, text), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: t.meta
    }
  }, meta));
}
const TONE = {
  plain: {
    bg: "var(--plumo-white)",
    border: "var(--plumo-border)",
    check: "var(--plumo-sky)",
    text: "var(--plumo-dark)",
    meta: "var(--plumo-muted)"
  },
  peach: {
    bg: "var(--plumo-peach)",
    border: "transparent",
    check: "var(--plumo-on-peach)",
    text: "var(--plumo-on-peach)",
    meta: "var(--plumo-on-peach)"
  },
  butter: {
    bg: "var(--plumo-butter)",
    border: "transparent",
    check: "var(--plumo-on-butter)",
    text: "var(--plumo-on-butter)",
    meta: "var(--plumo-on-butter)"
  }
};
Object.assign(__ds_scope, { TaskItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/TaskItem.jsx", error: String((e && e.message) || e) }); }

// components/patterns/Toast.jsx
try { (() => {
/**
 * Toast — a soft confirmation that slides up from the bottom. Night background,
 * butter text, blob-friendly. Auto-hides after `duration` ms when shown.
 */
function Toast({
  message,
  show = false,
  icon = "✿",
  duration = 3200,
  onHide,
  style
}) {
  React.useEffect(() => {
    if (!show || !duration) return;
    const t = setTimeout(() => onHide && onHide(), duration);
    return () => clearTimeout(t);
  }, [show, duration, onHide]);
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-live": "polite",
    style: {
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: show ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(20px)",
      background: "var(--plumo-night)",
      color: "var(--plumo-butter)",
      padding: "12px 20px 12px 16px",
      borderRadius: "var(--plumo-radius-pill)",
      fontSize: 14,
      fontWeight: 500,
      boxShadow: "var(--plumo-shadow-toast)",
      display: "flex",
      alignItems: "center",
      gap: 10,
      opacity: show ? 1 : 0,
      pointerEvents: show ? "auto" : "none",
      transition: "opacity var(--plumo-dur-default) var(--plumo-ease), transform var(--plumo-dur-default) var(--plumo-ease)",
      zIndex: 100,
      maxWidth: "92vw",
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, icon), message);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/Toast.jsx", error: String((e && e.message) || e) }); }

// components/patterns/WaitlistForm.jsx
try { (() => {
/**
 * WaitlistForm — the bordered pill that wraps an email field + CTA in one shape.
 * Focus glows sky. Shows a soft confirmation in Plumo's voice on submit.
 */
function WaitlistForm({
  placeholder = "your email, whenever you're ready",
  buttonLabel = "take a breath",
  microcopy = "free forever for one person · in soft launch · no credit card",
  onSubmit,
  style
}) {
  const [email, setEmail] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const submit = e => {
    e.preventDefault();
    if (!email) return;
    onSubmit && onSubmit(email);
    setSent(true);
  };
  if (sent) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...style
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: "var(--plumo-mist)",
        color: "var(--plumo-night)",
        padding: "12px 20px",
        borderRadius: "var(--plumo-radius-pill)",
        fontSize: 15,
        fontWeight: 500
      }
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true"
    }, "\u273F"), " you're on the list. we'll be gentle."));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: submit,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: "var(--plumo-white)",
      border: `1px solid ${focus ? "var(--plumo-sky)" : "var(--plumo-border)"}`,
      boxShadow: focus ? "0 0 0 4px rgba(96,165,250,0.18)" : "none",
      padding: "6px 6px 6px 18px",
      borderRadius: "var(--plumo-radius-pill)",
      maxWidth: 460,
      transition: "border-color var(--plumo-dur-default) var(--plumo-ease), box-shadow var(--plumo-dur-default) var(--plumo-ease)"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    placeholder: placeholder,
    style: {
      flex: 1,
      border: "none",
      background: "transparent",
      outline: "none",
      fontFamily: "inherit",
      fontSize: 15,
      padding: "10px 6px",
      color: "var(--plumo-dark)"
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    type: "submit",
    variant: "primary"
  }, buttonLabel)), microcopy && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14,
      fontSize: 13,
      color: "var(--plumo-muted)",
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--plumo-sky)"
    },
    "aria-hidden": "true"
  }, "\u273F"), " ", microcopy));
}
Object.assign(__ds_scope, { WaitlistForm });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/patterns/WaitlistForm.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/app.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Plumo app UI kit — the "today" product surface, interactive.
   A soft welcome → today view: toggle tasks, flip rest mode, add a gentle task.
   Composes design-system components from window.PlumoDesignSystem_a17b56. */
(function () {
  const NS = window.PlumoDesignSystem_a17b56;
  const {
    BlobMark,
    Icon,
    Button,
    TaskItem,
    Input,
    Pill
  } = NS;
  const START = [{
    text: "reply to olfa's note",
    meta: "9:12 am",
    done: true,
    tone: "plain"
  }, {
    text: "draft the paragraph you've been circling",
    meta: "whenever",
    done: false,
    tone: "plain"
  }, {
    text: "coffee break — actually take it",
    meta: "☕ 11:00",
    done: false,
    tone: "butter"
  }, {
    text: "read one article, close five tabs",
    meta: "15 min",
    done: false,
    tone: "plain"
  }, {
    text: "leave room for a walk 🌿",
    meta: "before 5",
    done: false,
    tone: "peach"
  }];
  const NAVS = [{
    icon: "home",
    label: "today"
  }, {
    icon: "calendar",
    label: "this week"
  }, {
    icon: "rest",
    label: "rest mode"
  }, {
    icon: "chat",
    label: "spaces"
  }, {
    icon: "search",
    label: "archive"
  }, {
    icon: "settings",
    label: "settings"
  }];
  function Welcome({
    onEnter
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "pa-welcome"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 120,
      breathe: true,
      title: "plumo waving"
    }), /*#__PURE__*/React.createElement("h1", null, "hi, we're plumo."), /*#__PURE__*/React.createElement("p", null, "let's figure out your day together \u2014 no pressure, no pomodoros."), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      arrow: true,
      onClick: onEnter
    }, "start gently"), /*#__PURE__*/React.createElement("span", {
      className: "pa-welcome-foot"
    }, "\u273F free forever for one person \xB7 no credit card"));
  }
  function Composer({
    onAdd
  }) {
    const [val, setVal] = React.useState("");
    const submit = e => {
      e.preventDefault();
      if (!val.trim()) return;
      onAdd(val.trim());
      setVal("");
    };
    return /*#__PURE__*/React.createElement("form", {
      className: "pa-composer",
      onSubmit: submit
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "add",
      size: 20,
      color: "var(--plumo-sky)"
    }), /*#__PURE__*/React.createElement("input", {
      value: val,
      onChange: e => setVal(e.target.value),
      placeholder: "add a little something \u2014 no rush"
    }), val.trim() && /*#__PURE__*/React.createElement(Button, {
      type: "submit",
      variant: "primary",
      size: "sm"
    }, "add it"));
  }
  function App() {
    const [entered, setEntered] = React.useState(false);
    const [active, setActive] = React.useState("today");
    const [tasks, setTasks] = React.useState(START);
    const [resting, setResting] = React.useState(false);
    const toggle = i => setTasks(p => p.map((t, j) => j === i ? {
      ...t,
      done: !t.done
    } : t));
    const add = text => setTasks(p => [...p, {
      text,
      meta: "whenever",
      done: false,
      tone: "plain"
    }]);
    const open = tasks.filter(t => !t.done).length;
    const done = tasks.filter(t => t.done).length;
    if (!entered) return /*#__PURE__*/React.createElement("div", {
      className: `pa-shell${resting ? " resting" : ""}`
    }, /*#__PURE__*/React.createElement(Welcome, {
      onEnter: () => setEntered(true)
    }));
    return /*#__PURE__*/React.createElement("div", {
      className: `pa-shell${resting ? " resting" : ""}`
    }, /*#__PURE__*/React.createElement("aside", {
      className: "pa-side"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pa-logo"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 28,
      mood: resting ? "sleepy" : "happy"
    }), /*#__PURE__*/React.createElement("span", null, "plumo")), /*#__PURE__*/React.createElement("ul", {
      className: "pa-nav"
    }, NAVS.map(n => /*#__PURE__*/React.createElement("li", {
      key: n.label,
      className: active === n.label ? "active" : undefined,
      onClick: () => setActive(n.label)
    }, /*#__PURE__*/React.createElement(Icon, {
      name: n.icon,
      size: 17
    }), n.label))), /*#__PURE__*/React.createElement("div", {
      className: "pa-side-card"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 32
    }), /*#__PURE__*/React.createElement("strong", null, "gentle tip"), /*#__PURE__*/React.createElement("span", null, "three tasks is plenty for a tuesday. carry the rest forward."))), /*#__PURE__*/React.createElement("main", {
      className: "pa-main"
    }, /*#__PURE__*/React.createElement("header", {
      className: "pa-top"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pa-greet"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 48,
      mood: resting ? "sleepy" : "happy",
      breathe: !resting
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, resting ? "resting · we'll be here" : "hi friend 👋"), /*#__PURE__*/React.createElement("p", null, resting ? "notifications are hushed. come back whenever." : "here's your gentle plan for today. no pressure."))), /*#__PURE__*/React.createElement(Pill, {
      tone: "mist"
    }, "tuesday \xB7 ", done, " done, ", open, " open")), resting ? /*#__PURE__*/React.createElement("div", {
      className: "pa-rest-state"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 140,
      mood: "sleepy"
    }), /*#__PURE__*/React.createElement("h3", null, "rest mode is on"), /*#__PURE__*/React.createElement("p", null, "the blob is napping. your work is safe and waiting. there's no streak to break."), /*#__PURE__*/React.createElement(Button, {
      variant: "warm",
      onClick: () => setResting(false)
    }, "wake plumo gently")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Composer, {
      onAdd: add
    }), /*#__PURE__*/React.createElement("div", {
      className: "pa-tasks"
    }, tasks.map((t, i) => /*#__PURE__*/React.createElement(TaskItem, _extends({
      key: i
    }, t, {
      onToggle: () => toggle(i)
    })))), open === 0 && /*#__PURE__*/React.createElement("div", {
      className: "pa-empty"
    }, "\u273F nothing left for today. enjoy it while it lasts."))), /*#__PURE__*/React.createElement("aside", {
      className: "pa-rail"
    }, /*#__PURE__*/React.createElement("div", {
      className: "pa-rest-card"
    }, /*#__PURE__*/React.createElement("span", {
      className: "eyebrow",
      style: {
        color: "var(--plumo-sky)"
      }
    }, "rest mode"), /*#__PURE__*/React.createElement("h4", null, resting ? "resting" : "take a breath"), /*#__PURE__*/React.createElement("p", null, "flip this on and plumo hushes. the blob naps, and we'll see you when you're ready."), /*#__PURE__*/React.createElement("button", {
      className: `pa-rest-toggle${resting ? " on" : ""}`,
      onClick: () => setResting(r => !r)
    }, /*#__PURE__*/React.createElement("span", {
      className: "pip"
    }, "\u273F"), resting ? "resting" : "try rest mode"), /*#__PURE__*/React.createElement(BlobMark, {
      size: 80,
      fill: "var(--plumo-peach)",
      className: "pa-rest-blob"
    })), /*#__PURE__*/React.createElement("div", {
      className: "pa-tip"
    }, /*#__PURE__*/React.createElement("strong", null, "today at a glance"), done, " done, ", open, " open, 0 overdue \u2014 there's no such thing here."), /*#__PURE__*/React.createElement("div", {
      className: "pa-tip soft"
    }, /*#__PURE__*/React.createElement("strong", null, "a small nudge"), "close one tab. just one. notice the room it makes.")));
  }
  window.PlumoApp = App;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/app.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/site.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Plumo website UI kit — full landing recreation.
   Composes design-system components from window.PlumoDesignSystem_a17b56.
   Exposes window.PlumoSite for index.html to mount. */
(function () {
  const NS = window.PlumoDesignSystem_a17b56;
  const {
    Button,
    Pill,
    BlobMark,
    Icon,
    FeatureCard,
    PackCard,
    PriceCard,
    FaqItem,
    WaitlistForm,
    Toast,
    TaskItem
  } = NS;
  const NAV = ["packs", "integrations", "pricing", "trust", "our story"];
  function Nav({
    onWaitlist
  }) {
    const [scrolled, setScrolled] = React.useState(false);
    React.useEffect(() => {
      const el = document.querySelector(".site-scroll");
      const onScroll = e => setScrolled((e.target.scrollTop || window.scrollY) > 8);
      const t = el || window;
      t.addEventListener("scroll", onScroll, {
        passive: true
      });
      return () => t.removeEventListener("scroll", onScroll);
    }, []);
    return /*#__PURE__*/React.createElement("header", {
      className: `nav${scrolled ? " scrolled" : ""}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "container nav-row"
    }, /*#__PURE__*/React.createElement("a", {
      className: "nav-brand"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 36
    }), /*#__PURE__*/React.createElement("span", {
      className: "wordmark"
    }, "plumo")), /*#__PURE__*/React.createElement("nav", null, /*#__PURE__*/React.createElement("ul", {
      className: "nav-links"
    }, NAV.map((l, i) => /*#__PURE__*/React.createElement("li", {
      key: l
    }, /*#__PURE__*/React.createElement("a", {
      className: i === 0 ? "active" : undefined
    }, l))))), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: onWaitlist
    }, "book a quiet call")));
  }
  function Hero({
    onWaitlist
  }) {
    const [tab, setTab] = React.useState("solo");
    return /*#__PURE__*/React.createElement("section", {
      className: "hero"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "hero-tabs",
      role: "tablist"
    }, /*#__PURE__*/React.createElement("button", {
      className: "hero-tab",
      role: "tab",
      "aria-selected": tab === "solo",
      onClick: () => setTab("solo")
    }, "for you"), /*#__PURE__*/React.createElement("button", {
      className: "hero-tab",
      role: "tab",
      "aria-selected": tab === "teams",
      onClick: () => setTab("teams")
    }, "for your team ", /*#__PURE__*/React.createElement("span", {
      style: {
        background: "var(--plumo-butter)",
        color: "var(--plumo-on-butter)",
        fontSize: 10,
        padding: "1px 7px",
        borderRadius: 100
      }
    }, "new"))), /*#__PURE__*/React.createElement("div", {
      className: "hero-grid"
    }, /*#__PURE__*/React.createElement("div", null, tab === "solo" ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", null, "soft things,", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
      className: "accent"
    }, "done simply.")), /*#__PURE__*/React.createElement("p", {
      className: "hero-sub"
    }, "plumo is a productivity app built around care, not pressure. no streaks, no guilt-tripping notifications \u2014 just a friendly blob helping you through the small, quiet work of a day."), /*#__PURE__*/React.createElement(WaitlistForm, {
      onSubmit: onWaitlist
    })) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h1", null, "a project tool", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
      className: "accent"
    }, "that doesn't shout.")), /*#__PURE__*/React.createElement("p", {
      className: "hero-sub"
    }, "sprints, issues, time tracking, resource planning \u2014 all the structure your team needs, dressed in plumo's voice. your AI assistants can drive it through our MCP server."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      arrow: true
    }, "see plumo for teams"), /*#__PURE__*/React.createElement(Button, {
      variant: "soft",
      onClick: onWaitlist
    }, "book a quiet call")), /*#__PURE__*/React.createElement("div", {
      className: "hero-chips"
    }, /*#__PURE__*/React.createElement("span", {
      className: "hero-chip"
    }, /*#__PURE__*/React.createElement("span", {
      className: "chip-dot"
    }, "\u2295"), "sprints & backlogs"), /*#__PURE__*/React.createElement("span", {
      className: "hero-chip"
    }, /*#__PURE__*/React.createElement("span", {
      className: "chip-dot"
    }, "\u23F1"), "time tracking"), /*#__PURE__*/React.createElement("span", {
      className: "hero-chip"
    }, /*#__PURE__*/React.createElement("span", {
      className: "chip-dot"
    }, "\u2726"), "MCP for AI"), /*#__PURE__*/React.createElement("span", {
      className: "hero-chip"
    }, /*#__PURE__*/React.createElement("span", {
      className: "chip-dot"
    }, "\u21C4"), "linear, slack, github")))), /*#__PURE__*/React.createElement("div", {
      className: "hero-stage",
      "aria-hidden": "true"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-plate"
    }), /*#__PURE__*/React.createElement("div", {
      className: "ring"
    }), /*#__PURE__*/React.createElement("div", {
      className: "hero-blob-wrap"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 300,
      breathe: true
    })), /*#__PURE__*/React.createElement("span", {
      className: "float-wrap t1"
    }, /*#__PURE__*/React.createElement(Pill, {
      tone: "white"
    }, "friendly-first")), /*#__PURE__*/React.createElement("span", {
      className: "float-wrap t2"
    }, /*#__PURE__*/React.createElement(Pill, {
      tone: "butter"
    }, "no streaks \u273F")), /*#__PURE__*/React.createElement("span", {
      className: "float-wrap t3"
    }, /*#__PURE__*/React.createElement(Pill, {
      tone: "peach"
    }, "rest is a plan")), /*#__PURE__*/React.createElement("span", {
      className: "float-wrap t4"
    }, /*#__PURE__*/React.createElement(Pill, {
      tone: "white"
    }, "ready when you are"))))));
  }
  function SocialStrip() {
    return /*#__PURE__*/React.createElement("div", {
      className: "social-strip"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container social-row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "label"
    }, "loved by gentle teams at"), /*#__PURE__*/React.createElement("div", {
      className: "names"
    }, /*#__PURE__*/React.createElement("span", null, "tendril"), /*#__PURE__*/React.createElement("span", null, "mossy"), /*#__PURE__*/React.createElement("span", null, "quietco"), /*#__PURE__*/React.createElement("span", null, "fernweh"), /*#__PURE__*/React.createElement("span", null, "slowmail"))));
  }
  function Features() {
    return /*#__PURE__*/React.createElement("section", {
      className: "features"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "section-head"
    }, /*#__PURE__*/React.createElement("span", {
      className: "eyebrow"
    }, "what is plumo"), /*#__PURE__*/React.createElement("h2", {
      className: "section-title"
    }, "a productivity app that doesn't act like one."), /*#__PURE__*/React.createElement("p", {
      className: "lead"
    }, "most tools push you. plumo sits beside you. three small ideas, held together by a friendly blob.")), /*#__PURE__*/React.createElement("div", {
      className: "feature-grid"
    }, /*#__PURE__*/React.createElement(FeatureCard, {
      tone: "mist",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "done"
      }),
      title: "gentle to-do lists",
      footer: "you're allowed to carry things forward \u2192"
    }, "tasks that don't shame you for not finishing. no red flags, no overdue banners, no little scarlet numbers staring at you all day."), /*#__PURE__*/React.createElement(FeatureCard, {
      tone: "peach",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "rest"
      }),
      title: "rest mode built in",
      footer: "a pause is a feature \u2192"
    }, "one tap and the app steps back. notifications quiet, the blob goes to sleep, and you're reminded it's okay to stop for a while."), /*#__PURE__*/React.createElement(FeatureCard, {
      tone: "butter",
      icon: /*#__PURE__*/React.createElement(Icon, {
        name: "breathe"
      }),
      title: "no pressure, no pomodoros",
      footer: "soft beats loud \u2192"
    }, "no streaks to break, no timers to race. tasks aren't graded. you aren't graded. plumo is a companion, not a coach."))));
  }
  function PacksBand() {
    return /*#__PURE__*/React.createElement("section", {
      className: "packs-band"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "section-head",
      style: {
        maxWidth: 720
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "eyebrow"
    }, "the four packs"), /*#__PURE__*/React.createElement("h2", {
      className: "section-title"
    }, "plumo is a family of four. start with any."), /*#__PURE__*/React.createElement("p", {
      className: "lead"
    }, "what started as a gentle PM tool is now four packs \u2014 PM, HR, marketing, and a vault for your team's secrets. same blob, same voice, four different jobs.")), /*#__PURE__*/React.createElement("div", {
      className: "packs-row"
    }, /*#__PURE__*/React.createElement(PackCard, {
      number: "pack 01",
      suffix: "PM",
      accent: "var(--plumo-pack-pm)",
      link: "see plumo PM",
      tagline: "projects, sprints, time tracking, MCP for AI. soft things, done simply."
    }), /*#__PURE__*/React.createElement(PackCard, {
      number: "pack 02",
      suffix: "HR",
      accent: "var(--plumo-pack-hr)",
      link: "see plumo HR",
      tagline: "onboarding, time off, reviews, org charts. people, held gently."
    }), /*#__PURE__*/React.createElement(PackCard, {
      number: "pack 03",
      suffix: "marketing",
      accent: "var(--plumo-pack-marketing)",
      link: "see plumo marketing",
      tagline: "campaigns, calendar, asset library, light analytics. campaigns that breathe."
    }), /*#__PURE__*/React.createElement(PackCard, {
      number: "pack 04",
      suffix: "vault",
      accent: "var(--plumo-pack-vault)",
      mood: "sleepy",
      link: "see plumo vault",
      tagline: "passwords, ssh keys, api tokens. e2e encrypted. secrets, kept softly."
    }))));
  }
  const INITIAL_TASKS = [{
    text: "reply to olfa's note",
    meta: "9:12 am",
    done: true,
    tone: "plain"
  }, {
    text: "draft the paragraph you've been circling",
    meta: "whenever",
    done: false,
    tone: "plain"
  }, {
    text: "coffee break — actually take it",
    meta: "☕ 11:00",
    done: false,
    tone: "butter"
  }, {
    text: "read one article, close five tabs",
    meta: "15 min",
    done: false,
    tone: "plain"
  }, {
    text: "leave room for a walk 🌿",
    meta: "before 5",
    done: false,
    tone: "peach"
  }];
  function ProductPreview() {
    const [tasks, setTasks] = React.useState(INITIAL_TASKS);
    const [resting, setResting] = React.useState(false);
    const toggle = i => setTasks(p => p.map((t, j) => j === i ? {
      ...t,
      done: !t.done
    } : t));
    const sideNav = [{
      icon: "home",
      label: "today",
      active: true
    }, {
      icon: "calendar",
      label: "this week"
    }, {
      icon: "rest",
      label: "rest mode"
    }, {
      icon: "chat",
      label: "spaces"
    }, {
      icon: "search",
      label: "archive"
    }];
    return /*#__PURE__*/React.createElement("section", {
      className: "preview"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "section-head",
      style: {
        maxWidth: 780
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "eyebrow"
    }, "the app"), /*#__PURE__*/React.createElement("h2", {
      className: "section-title"
    }, "this is plumo, in the wild."), /*#__PURE__*/React.createElement("p", {
      className: "lead"
    }, "a quick peek at a typical tuesday. go on \u2014 click a task, flip on rest mode. it's a real preview, not a screenshot.")), /*#__PURE__*/React.createElement("div", {
      className: "preview-frame"
    }, /*#__PURE__*/React.createElement("div", {
      className: "app-window"
    }, /*#__PURE__*/React.createElement("div", {
      className: "app-titlebar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "dots"
    }, /*#__PURE__*/React.createElement("span", {
      className: "dot r"
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot y"
    }), /*#__PURE__*/React.createElement("span", {
      className: "dot g"
    })), /*#__PURE__*/React.createElement("span", {
      className: "url"
    }, "plumo.app/today")), /*#__PURE__*/React.createElement("div", {
      className: "app-body"
    }, /*#__PURE__*/React.createElement("aside", {
      className: "app-side"
    }, /*#__PURE__*/React.createElement("div", {
      className: "logo-row"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 22
    }), /*#__PURE__*/React.createElement("span", {
      className: "wm"
    }, "plumo")), /*#__PURE__*/React.createElement("ul", {
      className: "app-nav"
    }, sideNav.map(n => /*#__PURE__*/React.createElement("li", {
      key: n.label,
      className: n.active ? "active" : undefined
    }, /*#__PURE__*/React.createElement(Icon, {
      name: n.icon,
      size: 16
    }), n.label))), /*#__PURE__*/React.createElement("div", {
      className: "side-pro"
    }, /*#__PURE__*/React.createElement("strong", null, "gentle tip"), "three tasks is plenty for a tuesday. carry the rest forward.")), /*#__PURE__*/React.createElement("div", {
      className: "app-main"
    }, /*#__PURE__*/React.createElement("div", {
      className: "app-greeting"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 44,
      mood: resting ? "sleepy" : "happy"
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "hi friend \uD83D\uDC4B"), /*#__PURE__*/React.createElement("p", null, "here's your gentle plan for today. no pressure."))), /*#__PURE__*/React.createElement("div", {
      className: "task-list"
    }, tasks.map((t, i) => /*#__PURE__*/React.createElement(TaskItem, _extends({
      key: i
    }, t, {
      onToggle: () => toggle(i)
    }))))), /*#__PURE__*/React.createElement("aside", {
      className: "app-aside"
    }, /*#__PURE__*/React.createElement("div", {
      className: "rest-card"
    }, /*#__PURE__*/React.createElement("span", {
      className: "rest-eyebrow"
    }, "rest mode"), /*#__PURE__*/React.createElement("h4", null, resting ? "resting · we'll be here" : "take a breath"), /*#__PURE__*/React.createElement("p", null, "flip this on and plumo hushes. notifications quiet, the blob naps, and we'll see you when you're ready."), /*#__PURE__*/React.createElement("button", {
      className: `rest-toggle${resting ? " on" : ""}`,
      onClick: () => setResting(r => !r)
    }, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true"
    }, "\u273F"), /*#__PURE__*/React.createElement("span", null, "try rest mode")), /*#__PURE__*/React.createElement(BlobMark, {
      size: 80,
      className: "rest-blob",
      fill: "var(--plumo-peach)"
    })), /*#__PURE__*/React.createElement("div", {
      className: "tip-card"
    }, /*#__PURE__*/React.createElement("strong", null, "today at a glance"), tasks.filter(t => t.done).length, " done, ", tasks.filter(t => !t.done).length, " open, 0 overdue (there's no such thing here)."), /*#__PURE__*/React.createElement("div", {
      className: "tip-card",
      style: {
        background: "var(--plumo-mist)",
        borderColor: "transparent"
      }
    }, /*#__PURE__*/React.createElement("strong", {
      style: {
        color: "var(--plumo-blue)"
      }
    }, "a small nudge"), "close one tab. just one. notice the room it makes.")))))));
  }
  function Testimonial() {
    return /*#__PURE__*/React.createElement("section", {
      className: "testimonial"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "testimonial-card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "t-blob"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 96,
      fill: "var(--plumo-blue)"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("blockquote", null, "\"it's the first tool that didn't make me feel behind. i open it and it feels like a friend asking how i'm doing.\""), /*#__PURE__*/React.createElement("div", {
      className: "attrib"
    }, /*#__PURE__*/React.createElement("strong", null, "maya r."), " \xB7 writer, using plumo for 6 months")))));
  }
  function Pricing({
    onWaitlist
  }) {
    return /*#__PURE__*/React.createElement("section", {
      className: "pricing",
      id: "pricing"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "section-head",
      style: {
        textAlign: "center",
        margin: "0 auto 48px",
        maxWidth: 600
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "eyebrow"
    }, "pricing"), /*#__PURE__*/React.createElement("h2", {
      className: "section-title",
      style: {
        margin: "14px auto 18px"
      }
    }, "kind to your day, kind to your wallet."), /*#__PURE__*/React.createElement("p", {
      className: "lead",
      style: {
        margin: "0 auto"
      }
    }, "free forever for one person. a little more when you bring your people.")), /*#__PURE__*/React.createElement("div", {
      className: "pricing-grid"
    }, /*#__PURE__*/React.createElement(PriceCard, {
      name: "just you",
      price: "$0",
      unit: "forever",
      tagline: "everything one person needs to have a softer day.",
      features: ["unlimited gentle tasks", "rest mode", "one space", "the whole blob family"],
      cta: "start gently",
      onCta: onWaitlist
    }), /*#__PURE__*/React.createElement(PriceCard, {
      featured: true,
      name: "you + a few",
      price: "$6",
      unit: "/ person / mo",
      tagline: "for small, kind teams who'd rather not shout.",
      features: ["shared spaces", "team rest days", "MCP for AI assistants", "priority, gentle support"],
      cta: "bring your people",
      onCta: onWaitlist
    }))));
  }
  function Faq() {
    return /*#__PURE__*/React.createElement("section", {
      className: "faq",
      style: {
        background: "var(--plumo-canvas)"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "section-head",
      style: {
        textAlign: "center",
        margin: "0 auto 48px",
        maxWidth: 600
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "eyebrow"
    }, "questions"), /*#__PURE__*/React.createElement("h2", {
      className: "section-title",
      style: {
        margin: "14px auto 0"
      }
    }, "things people gently wonder.")), /*#__PURE__*/React.createElement("div", {
      className: "faq-list"
    }, /*#__PURE__*/React.createElement(FaqItem, {
      question: "is there really a free plan?",
      defaultOpen: true
    }, "yes \u2014 free forever for one person. no card, no countdown, no trial that quietly ends."), /*#__PURE__*/React.createElement(FaqItem, {
      question: "what happens if i fall behind?"
    }, "nothing. tasks carry forward, quietly. there's no overdue, no streak to break, no red badge."), /*#__PURE__*/React.createElement(FaqItem, {
      question: "can my team use it?"
    }, "they can. plumo for teams adds shared spaces and sprints \u2014 same voice, a little more structure."), /*#__PURE__*/React.createElement(FaqItem, {
      question: "do you send guilt-trip notifications?"
    }, "never. plumo only nudges when you ask it to, and even then, gently."))));
  }
  function FinalCta({
    onWaitlist
  }) {
    return /*#__PURE__*/React.createElement("section", {
      className: "final-cta"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "final-cta-inner"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, "let's have a softer day."), /*#__PURE__*/React.createElement("p", null, "join the soft launch. we'll email you when there's a quiet corner of plumo ready for you."), /*#__PURE__*/React.createElement(WaitlistForm, {
      buttonLabel: "take a breath",
      microcopy: "no spam, no pressure, no countdown",
      onSubmit: onWaitlist
    })), /*#__PURE__*/React.createElement("div", {
      className: "final-cta-blob"
    }, /*#__PURE__*/React.createElement("div", {
      className: "plate"
    }), /*#__PURE__*/React.createElement("div", {
      className: "blobpos"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 220,
      breathe: true,
      fill: "var(--plumo-blue)"
    }))))));
  }
  function Footer() {
    const cols = [{
      h: "product",
      links: ["packs", "pricing", "integrations", "rest mode"]
    }, {
      h: "company",
      links: ["our story", "trust", "careers", "blog"]
    }, {
      h: "stay soft",
      links: ["newsletter", "twitter", "mastodon", "rss"]
    }];
    return /*#__PURE__*/React.createElement("footer", {
      className: "site-footer"
    }, /*#__PURE__*/React.createElement("div", {
      className: "container"
    }, /*#__PURE__*/React.createElement("div", {
      className: "footer-grid"
    }, /*#__PURE__*/React.createElement("div", {
      className: "footer-brand"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 28
    }), /*#__PURE__*/React.createElement("span", {
      className: "wordmark"
    }, "plumo")), /*#__PURE__*/React.createElement("p", null, "soft things, done simply. a productivity app built around care, not pressure.")), cols.map(c => /*#__PURE__*/React.createElement("div", {
      className: "footer-col",
      key: c.h
    }, /*#__PURE__*/React.createElement("h4", null, c.h), /*#__PURE__*/React.createElement("ul", null, c.links.map(l => /*#__PURE__*/React.createElement("li", {
      key: l
    }, /*#__PURE__*/React.createElement("a", null, l))))))), /*#__PURE__*/React.createElement("div", {
      className: "footer-base"
    }, /*#__PURE__*/React.createElement("span", {
      className: "mini-blob"
    }, /*#__PURE__*/React.createElement(BlobMark, {
      size: 18
    }), " \xA9 2026 plumo. be gentle with yourself."), /*#__PURE__*/React.createElement("span", null, "made slowly, on purpose."))));
  }
  function Site() {
    const [toast, setToast] = React.useState(false);
    const onWaitlist = () => setToast(true);
    return /*#__PURE__*/React.createElement("div", {
      className: "site"
    }, /*#__PURE__*/React.createElement(Nav, {
      onWaitlist: onWaitlist
    }), /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(Hero, {
      onWaitlist: onWaitlist
    }), /*#__PURE__*/React.createElement(SocialStrip, null), /*#__PURE__*/React.createElement(Features, null), /*#__PURE__*/React.createElement(PacksBand, null), /*#__PURE__*/React.createElement(ProductPreview, null), /*#__PURE__*/React.createElement(Testimonial, null), /*#__PURE__*/React.createElement(Pricing, {
      onWaitlist: onWaitlist
    }), /*#__PURE__*/React.createElement(Faq, null), /*#__PURE__*/React.createElement(FinalCta, {
      onWaitlist: onWaitlist
    })), /*#__PURE__*/React.createElement(Footer, null), /*#__PURE__*/React.createElement(Toast, {
      message: "you're on the list. we'll be gentle.",
      show: toast,
      onHide: () => setToast(false)
    }));
  }
  window.PlumoSite = Site;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/site.jsx", error: String((e && e.message) || e) }); }

__ds_ns.BlobMark = __ds_scope.BlobMark;

__ds_ns.ICON_NAMES = __ds_scope.ICON_NAMES;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.FaqItem = __ds_scope.FaqItem;

__ds_ns.FeatureCard = __ds_scope.FeatureCard;

__ds_ns.PackCard = __ds_scope.PackCard;

__ds_ns.PriceCard = __ds_scope.PriceCard;

__ds_ns.TaskItem = __ds_scope.TaskItem;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.WaitlistForm = __ds_scope.WaitlistForm;

})();
