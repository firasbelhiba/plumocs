'use client';

import { Button, Drawer, Input, Kbd, Modal, Select, Textarea } from '../common';

const SHORTCUT_ROW = 'flex items-center gap-2.5 text-[13px] text-fg-2';
const EYEBROW = 'text-[11px] font-medium uppercase tracking-[2px] text-[color:var(--primary)]';

/**
 * Two overlays used to live here and no longer do.
 *
 * The toast stack was a hand-rolled navy pill in the bottom-right corner with a
 * magic `zIndex: 120`, no exit and no way to dismiss it. `react-hot-toast` is
 * configured once in `components/layout/RootLayoutClient.jsx` and renders its
 * own container, so there is nothing to place here.
 *
 * The confirm dialog was component state projected through `renderVals()`. It
 * is now `contexts/DialogContext.tsx`, which mounts its own `<Modal>` from the
 * provider — the console awaits a promise instead of stashing a callback.
 */
export default function Overlays({ V }) {
  return (
    <>
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

      {/* This was a `<Modal size="lg">` with no `title`, and `Modal.tsx:130`
          reads a missing title as "no header" — so the sheet shipped with no
          close button and no way out but Escape. It is a side panel of
          reference material, which is what a drawer is for; the heading it was
          drawing by hand is now the drawer's own eyebrow and title. */}
      <Drawer open={V.sheet} onClose={V.closeSheet} eyebrow="reference" title="keyboard, if you like keyboards">
        <div className="flex flex-col gap-5 p-4">
          <div className="flex items-center gap-3">
            <img
              src="/assets/mascots/mascot-02-ticket-in-hand.svg"
              alt=""
              className="w-10 h-auto block flex-none"
              style={{ animation: 'cs-breathe 5.5s ease-in-out infinite' }}
            />
            <span className="text-[12.5px] text-fg-3">the mouse works just as well ✿</span>
          </div>

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
      </Drawer>
    </>
  );
}
