'use client';

import { Button, Drawer, Input, Kbd, Modal, Select, Textarea } from '../common';
import { BlobHappy } from '../brand';

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
        title="New Conversation"
        size="lg"
        footer={
          <>
            <Button variant="outline" size="md" onClick={V.closeNewTicket}>Cancel</Button>
            <Button size="md" onClick={V.submitNew}>Create</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <p className="text-[13px] text-fg-3">
            For when someone reaches you outside the usual channels.
          </p>

          {/* Validation belongs under the field that failed. A toast said what
              was wrong somewhere else on the screen and then took itself away. */}
          <Input
            label="Subject"
            value={V.newSubject}
            onChange={V.onNewSubject}
            error={V.newSubjectError}
            placeholder="Brief summary of the conversation"
            className="h-btn-lg text-[14px]"
          />

          <Select
            label="Customer"
            value={V.newCustomer}
            onChange={V.onNewCustomer}
            error={V.newCustomerError}
            options={V.customerOptions.map((o) => ({ value: o.id, label: o.label }))}
          />

          <div className="flex flex-col gap-[7px]">
            <span className="text-xs font-medium text-fg">Priority</span>
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
            label="First Message"
            value={V.newBody}
            onChange={V.onNewBody}
            rows={4}
            placeholder="In their words, as best you have them…"
          />
        </div>
      </Modal>

      {/* This was a `<Modal size="lg">` with no `title`, and `Modal.tsx:130`
          reads a missing title as "no header" — so the sheet shipped with no
          close button and no way out but Escape. It is a side panel of
          reference material, which is what a drawer is for; the heading it was
          drawing by hand is now the drawer's own eyebrow and title. */}
      <Drawer open={V.sheet} onClose={V.closeSheet} eyebrow="reference" title="Keyboard shortcuts">
        <div className="flex flex-col gap-5 p-4">
          <div className="flex items-center gap-3">
            {/* PM's mascot (`brand/Blobs.tsx`), sized to the row rather than to
                its 80px default — this one sits inline beside a 12.5px caption. */}
            <BlobHappy size={40} className="flex-none" />
            <span className="text-[12.5px] text-fg-3">The mouse works just as well.</span>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className={EYEBROW}>the inbox</span>
            <span className={SHORTCUT_ROW}><Kbd>j</Kbd><Kbd>k</Kbd>Move through the list</span>
            <span className={SHORTCUT_ROW}><Kbd>enter</Kbd>Open the one you&apos;re on</span>
            <span className={SHORTCUT_ROW}><Kbd>e</Kbd>Change status</span>
            <span className={SHORTCUT_ROW}><Kbd>a</Kbd>Assign to me</span>
            <span className={SHORTCUT_ROW}><Kbd>x</Kbd>Select several at once</span>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className={EYEBROW}>everywhere</span>
            <span className={SHORTCUT_ROW}><Kbd>r</Kbd>Jump to the reply box</span>
            <span className={SHORTCUT_ROW}><Kbd>n</Kbd>New conversation</span>
            <span className={SHORTCUT_ROW}><Kbd>/</Kbd>Search</span>
            <span className={SHORTCUT_ROW}><Kbd>g then i</Kbd>Go to inbox</span>
            <span className={SHORTCUT_ROW}><Kbd>?</Kbd>This sheet</span>
          </div>
        </div>
      </Drawer>
    </>
  );
}
