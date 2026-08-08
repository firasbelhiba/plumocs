'use client';

import { Button, Input, Kbd, Modal, Select, Textarea } from '../common';

const SHORTCUT_ROW = 'flex items-center gap-2.5 text-[13px] text-fg-2';
const EYEBROW = 'text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';

export default function Overlays({ V }) {
  return (
    <>
      {/* toasts — the console's own affordance, kept as-is */}
      <div className="fixed right-5 bottom-5 flex flex-col gap-2 items-end pointer-events-none" style={{ zIndex: 120 }}>
        {V.toasts.map((t) => (
          <div
            key={t.id}
            data-anim="in"
            data-tone={t.tone}
            className="flex items-center gap-2.5 px-4 py-3 rounded-full text-[13px] max-w-[420px] shadow-modal animate-slide-up"
            style={{ background: 'var(--plumo-night)', color: 'var(--plumo-on-night)' }}
          >
            <i className="w-2 h-2 rounded-full flex-none" style={{ background: 'var(--tone-hue)' }} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      <Modal
        isOpen={V.hasConfirm}
        onClose={V.confirmCancel}
        title={V.confirmTitle}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="md" onClick={V.confirmCancel}>keep it as is</Button>
            <Button variant={V.confirmDanger ? 'danger' : 'primary'} size="md" onClick={V.confirmOk}>
              {V.confirmOkLabel}
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-fg-2 leading-relaxed">{V.confirmBody}</p>
      </Modal>

      <Modal
        isOpen={V.newT}
        onClose={V.closeNewTicket}
        title="a new conversation"
        size="lg"
        footer={
          <>
            <Button variant="outline" size="md" onClick={V.closeNewTicket}>not now</Button>
            <Button size="md" onClick={V.submitNew}>start it</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-[13px] text-fg-3">
            for when someone reaches you outside the usual channels.
          </p>

          {/* Validation belongs under the field that failed. A toast said what
              was wrong somewhere else on the screen and then took itself away. */}
          <Input
            label="subject"
            value={V.newSubject}
            onChange={V.onNewSubject}
            error={V.newSubjectError}
            placeholder="what's going on?"
            className="h-btn-lg text-[14px]"
          />

          <Select
            label="customer"
            value={V.newCustomer}
            onChange={V.onNewCustomer}
            error={V.newCustomerError}
            options={V.customerOptions.map((o) => ({ value: o.id, label: o.label }))}
          />

          <div className="flex flex-col gap-[7px]">
            <span className="text-xs font-medium text-fg">priority</span>
            <div className="flex gap-1.5">
              {V.newPriorityOptions.map((o) => (
                <button
                  key={o.id}
                  onClick={V.onNewPriority}
                  data-v={o.id}
                  data-on={String(o.on)}
                  className="h-btn-md px-4 rounded-full text-[12.5px] cursor-pointer transition-colors duration-[var(--dur-instant)] focus-ring"
                  style={{
                    border: '1px solid var(--cs-onbd)',
                    background: 'var(--cs-onbg)',
                    color: 'var(--cs-onfg)',
                    fontWeight: 'var(--cs-onw)',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            label="first message"
            value={V.newBody}
            onChange={V.onNewBody}
            rows={4}
            placeholder="in their words, as best you have them…"
          />
        </div>
      </Modal>

      <Modal isOpen={V.sheet} onClose={V.closeSheet} size="lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/assets/mascots/mascot-02-ticket-in-hand.svg"
              alt=""
              className="w-10 h-auto block"
              style={{ animation: 'cs-breathe 5.5s ease-in-out infinite' }}
            />
            <div className="flex-1 flex flex-col">
              <span className="text-[17px] font-medium tracking-[-.4px]">keyboard, if you like keyboards</span>
              <span className="text-[12.5px] text-fg-3">the mouse works just as well ✿</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="flex flex-col gap-2.5">
              <span className={EYEBROW}>the inbox</span>
              <span className={SHORTCUT_ROW}><Kbd>j</Kbd><Kbd>k</Kbd>move through the list</span>
              <span className={SHORTCUT_ROW}><Kbd>enter</Kbd>open the one you&apos;re on</span>
              <span className={SHORTCUT_ROW}><Kbd>e</Kbd>change status</span>
              <span className={SHORTCUT_ROW}><Kbd>a</Kbd>assign to me</span>
              <span className={SHORTCUT_ROW}><Kbd>x</Kbd>pick a few at once</span>
            </div>
            <div className="flex flex-col gap-2.5">
              <span className={EYEBROW}>everywhere</span>
              <span className={SHORTCUT_ROW}><Kbd>r</Kbd>jump to the reply box</span>
              <span className={SHORTCUT_ROW}><Kbd>n</Kbd>new conversation</span>
              <span className={SHORTCUT_ROW}><Kbd>/</Kbd>search</span>
              <span className={SHORTCUT_ROW}><Kbd>g then i</Kbd>go to inbox</span>
              <span className={SHORTCUT_ROW}><Kbd>?</Kbd>this sheet</span>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
