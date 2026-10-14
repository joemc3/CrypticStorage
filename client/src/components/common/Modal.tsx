import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

const sizeClasses = {
  sm: 'md:max-w-[440px]',
  md: 'md:max-w-[560px]',
  lg: 'md:max-w-[560px]',
  xl: 'md:max-w-[880px]',
  full: 'md:max-w-[1100px]',
};

/** Desktop: a centred sheet. Phone: a bottom sheet with a grab handle. */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children, size = 'md', showCloseButton = true }) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-[var(--overlay)]" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center md:items-center md:p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="translate-y-6 opacity-0 md:translate-y-0 md:scale-[.98]"
              enterTo="translate-y-0 opacity-100 md:scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Dialog.Panel
                className={`w-full max-h-[92vh] overflow-y-auto rounded-t-[18px] border border-line bg-surface text-left shadow-[var(--shadow)] md:rounded-[14px] ${sizeClasses[size]}`}
              >
                <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong md:hidden" aria-hidden="true" />
                {(title || showCloseButton) && (
                  <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                    {title ? (
                      <Dialog.Title as="h2" className="text-base font-semibold leading-[22px] text-ink">
                        {title}
                      </Dialog.Title>
                    ) : (
                      <span />
                    )}
                    {showCloseButton && (
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="-mr-2 inline-flex h-11 w-11 flex-none items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
                      >
                        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
                <div className="p-5">
                  {description && (
                    <Dialog.Description className="mb-4 text-sm text-ink-2">{description}</Dialog.Description>
                  )}
                  {children}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
