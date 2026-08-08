/**
 * The plumo design system, shared verbatim with the project-management
 * console. Brand colour is re-anchored to support green in app/globals.css —
 * no component below hardcodes a brand hex, so the same files serve both
 * pillars.
 *
 * Components that are coupled to project-management data (UserSelect,
 * IssueSelect, MentionTextarea, DescriptionEditor, ImageCropperModal,
 * LogoLoader) are deliberately not carried over.
 */
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Select } from './Select';
export type { SelectProps } from './Select';

export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { Dropdown, DropdownItem } from './Dropdown';
export type { DropdownProps } from './Dropdown';

export { LoadingSpinner } from './LoadingSpinner';
export { Skeleton, SkeletonCard, SkeletonTable } from './Skeleton';
export { SettingsFormSkeleton } from './SettingsFormSkeleton';
export { AdminListPageSkeleton } from './AdminListPageSkeleton';

export { Breadcrumb } from './Breadcrumb';
export { Pagination } from './Pagination';
export { EmptyState } from './EmptyState';
export { ConfirmDeleteModal } from './ConfirmDeleteModal';
export { ErrorScreen } from './ErrorScreen';
export { FileUpload, FilePreview } from './FileUpload';
export { EmojiReactionPicker } from './EmojiReactionPicker';
export { LazyImage, LazyAvatar } from './LazyImage';
export { UserAvatar, UserAvatarWithStatus } from './UserAvatar';
export { StatCard } from './StatCard';
export { SortIcon } from './SortIcon';
export { FilterBar } from './FilterBar';
export type { FilterBarProps, FilterField } from './FilterBar';
export { MiniActivityChart } from './MiniActivityChart';

/* plumo design-system primitives */
export { Sparkline } from './Sparkline';
export { StatusPill, getStatusKeyForWorkflowBehavior } from './StatusPill';
export type { StatusKey } from './StatusPill';
export { PriorityBars } from './PriorityBars';
export type { PriorityLevel } from './PriorityBars';
export { Icon } from './Icon';
export type { IconName } from './Icon';
export { Kbd } from './Kbd';
export { Segment } from './Segment';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';
export { CHECKBOX, CHECKBOX_STYLE, CHECK_LABEL, RADIO } from './formControls';
export { Progress } from './Progress';
export { AvatarGroup } from './AvatarGroup';

/* support-console extension — domain colour via [data-tone] */
export { TonePill } from './TonePill';
export type { TonePillProps } from './TonePill';

/* robustness + composition helpers from the shared library */
export { ErrorBoundary } from './ErrorBoundary';
export { MentionAutocomplete } from './MentionAutocomplete';
