import React, { useMemo, useRef, useState } from 'react';
import {
  Search,
  UserPlus,
  Phone,
  Video,
  AtSign,
  Mail,
  MessageSquare,
  CheckCircle2,
  ShieldCheck,
  Users,
  X,
  ArrowRightLeft,
  Sparkles,
  Trash2,
  MoreVertical,
  Copy,
  KeyRound,
  Share2,
  CheckSquare,
  Check,
} from 'lucide-react';
import { DirectoryUser, SavedContact, UserAccount } from '../types/simple';
import { PRESET_PROFILE_PHOTOS, UserAvatar } from './ProfilePhotoModal';
import { apiFetch, getRemoteServerOrigin } from '../utils/androidBridge';
import { shareSimpleApk } from '../hooks/usePWAInstall';
import {
  computeEmailHash,
  computePhoneHash,
  computePhoneTailHash,
  deriveUidFromPhone,
  generateDefaultUsername,
  maskPhoneForFirestore,
  normalizePhone,
} from '../data/initialState';

interface ContactsDirectoryModalProps {
  currentAccount: UserAccount;
  directoryUsers: DirectoryUser[];
  savedContacts: SavedContact[];
  onStartChatWithUser: (user: DirectoryUser, customSavedName?: string) => void;
  onStartCallWithUser?: (
    user: DirectoryUser,
    callType: 'audio' | 'video',
    extraParticipants?: DirectoryUser[]
  ) => void;
  onCreateGroupWithUsers?: (groupName: string, members: DirectoryUser[]) => void;
  onSaveContact: (contact: SavedContact, startChatImmediately: boolean) => void;
  onDeleteSavedContact: (contactId: string) => void;
  onRegisterOrSwitchAccount: (newAccount: UserAccount) => void;
  onClose: () => void;
}

export const ContactsDirectoryModal: React.FC<ContactsDirectoryModalProps> = ({
  currentAccount,
  directoryUsers,
  savedContacts,
  onStartChatWithUser,
  onStartCallWithUser,
  onCreateGroupWithUsers,
  onSaveContact,
  onDeleteSavedContact,
  onRegisterOrSwitchAccount,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'lookup' | 'contacts' | 'accounts'>('lookup');

  // Multi-Contact Selection State across Directory & Saved Contacts
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [selectedUserUids, setSelectedUserUids] = useState<string[]>([]);
  const [selectedSavedContactIds, setSelectedSavedContactIds] = useState<string[]>([]);
  const [batchGroupNameInput, setBatchGroupNameInput] = useState<string>('');
  const [showBatchGroupPrompt, setShowBatchGroupPrompt] = useState<boolean>(false);
  const [showSelectionMoreMenu, setShowSelectionMoreMenu] = useState<boolean>(false);

  const hasMultiSelection =
    isMultiSelectMode || selectedUserUids.length > 0 || selectedSavedContactIds.length > 0;

  const toggleSelectDirectoryUser = (uid: string, savedId?: string) => {
    setSelectedUserUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
    if (savedId) {
      setSelectedSavedContactIds((prev) =>
        prev.includes(savedId) ? prev.filter((id) => id !== savedId) : [...prev, savedId]
      );
    }
  };

  const clearMultiSelection = () => {
    setIsMultiSelectMode(false);
    setSelectedUserUids([]);
    setSelectedSavedContactIds([]);
    setShowBatchGroupPrompt(false);
    setShowSelectionMoreMenu(false);
  };

  // Viewport-Safe Long-Press & 3-Dots Options Menu State for Directory Users & Saved Contacts
  const [selectedDirectoryTarget, setSelectedDirectoryTarget] = useState<{
    user: DirectoryUser;
    savedContactId?: string;
    customSavedName?: string;
  } | null>(null);
  const [directoryToast, setDirectoryToast] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const showDirToast = (msg: string) => {
    setDirectoryToast(msg);
    setTimeout(() => setDirectoryToast(null), 2800);
  };

  const startLongPress = (target: {
    user: DirectoryUser;
    savedContactId?: string;
    customSavedName?: string;
  }) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      navigator.vibrate?.(18);
      setSelectedDirectoryTarget(target);
    }, 420);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Tab 1: Global Lookup by Phone, @username, or Email
  const [searchQuery, setSearchQuery] = useState('');

  // Tab 2: Save Contact by Phone Number
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactUsername, setContactUsername] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactFeedback, setContactFeedback] = useState<string | null>(null);

  // Match helper: checks if a phone, username, or email matches a registered Simple user via SHA-256 phoneHash / tailHash / emailHash
  const findMatchingDirectoryUser = (
    phoneStr: string,
    usernameStr?: string,
    emailStr?: string
  ): DirectoryUser | undefined => {
    const normDigits = normalizePhone(phoneStr);
    const queryPhoneHash = normDigits.length >= 6 ? computePhoneHash(normDigits) : '';
    const queryTailHash = normDigits.length >= 6 ? computePhoneTailHash(normDigits) : '';
    const cleanUser = (usernameStr || '').trim().toLowerCase().replace(/^@/, '');
    const cleanMail = (emailStr || '').trim().toLowerCase();
    const queryEmailHash = cleanMail ? computeEmailHash(cleanMail) : '';

    return directoryUsers.find((u) => {
      if (normDigits.length >= 6) {
        if (queryPhoneHash && u.phoneHash && u.phoneHash === queryPhoneHash) {
          return true;
        }
        if (queryTailHash && u.phoneTailHash && u.phoneTailHash === queryTailHash) {
          return true;
        }
        if (
          u.normalizedPhone &&
          u.normalizedPhone !== 'REDACTED_SHA256' &&
          (u.normalizedPhone === normDigits ||
            u.normalizedPhone.endsWith(normDigits) ||
            normDigits.endsWith(u.normalizedPhone.slice(-8)))
        ) {
          return true;
        }
      }
      if (cleanUser && u.username.toLowerCase() === cleanUser) {
        return true;
      }
      if (queryEmailHash && u.emailHash && u.emailHash === queryEmailHash) {
        return true;
      }
      if (cleanMail && u.email && u.email.toLowerCase() === cleanMail) {
        return true;
      }
      return false;
    });
  };

  // Live matched user preview while typing a mobile number in "Save Contact"
  const liveMatchedContactUser = useMemo(() => {
    if (!contactPhone.trim() && !contactUsername.trim() && !contactEmail.trim()) {
      return undefined;
    }
    return findMatchingDirectoryUser(contactPhone, contactUsername, contactEmail);
  }, [contactPhone, contactUsername, contactEmail, directoryUsers]);

  // Filtered directory users for Lookup tab (matches by SHA-256 phoneHash/tailHash without exposing plaintext phone numbers)
  const filteredDirectory = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return directoryUsers;
    const qLower = q.toLowerCase().replace(/^@/, '');
    const qDigits = normalizePhone(q);
    const qPhoneHash = qDigits.length >= 6 ? computePhoneHash(qDigits) : '';
    const qTailHash = qDigits.length >= 6 ? computePhoneTailHash(qDigits) : '';
    const qEmailHash = qLower.includes('@') ? computeEmailHash(qLower) : '';

    return directoryUsers.filter((u) => {
      if (u.username.toLowerCase().includes(qLower)) return true;
      if (qEmailHash && u.emailHash === qEmailHash) return true;
      if (u.email && u.email.toLowerCase().includes(qLower)) return true;
      if (u.name.toLowerCase().includes(qLower)) return true;
      if (qPhoneHash && u.phoneHash === qPhoneHash) return true;
      if (qTailHash && u.phoneTailHash === qTailHash) return true;
      if (qDigits.length >= 3 && u.normalizedPhone && u.normalizedPhone !== 'REDACTED_SHA256') {
        if (
          u.normalizedPhone.includes(qDigits) ||
          qDigits.includes(u.normalizedPhone)
        ) {
          return true;
        }
      }
      return false;
    });
  }, [directoryUsers, searchQuery]);

  const handleSaveContactSubmit = (startChatImmediately: boolean) => {
    if (!contactPhone.trim() && !contactUsername.trim() && !contactEmail.trim()) {
      setContactFeedback('Please enter a mobile phone number, @username, or email.');
      return;
    }

    const matched = liveMatchedContactUser;
    const normPhone = normalizePhone(contactPhone || matched?.phone || '') || `${Date.now()}`.slice(-10);
    const finalPhone = contactPhone.trim() || matched?.phone || `+1 ${normPhone}`;
    const finalName =
      contactName.trim() ||
      matched?.name ||
      contactUsername.trim() ||
      finalPhone;

    const pHash = computePhoneHash(normPhone);
    const pTailHash = computePhoneTailHash(normPhone);
    const deterministicUid = matched?.uid || deriveUidFromPhone(normPhone);

    const newSaved: SavedContact = {
      id: `cnt_${Date.now()}`,
      savedName: finalName,
      phone: finalPhone,
      normalizedPhone: normPhone,
      phoneHash: pHash,
      phoneTailHash: pTailHash,
      username:
        contactUsername.trim().replace(/^@/, '') ||
        matched?.username ||
        generateDefaultUsername(finalName, finalPhone, contactEmail),
      email: contactEmail.trim().toLowerCase() || matched?.email || '',
      matchedUserUid: deterministicUid,
      addedAt: Date.now(),
    };

    onSaveContact(newSaved, startChatImmediately);
    setContactName('');
    setContactPhone('');
    setContactUsername('');
    setContactEmail('');
    setContactFeedback(
      matched
        ? `Saved ${finalName} (@${matched.username}) — Already on Simple!`
        : `Saved ${finalName} (${finalPhone}) — You can invite them on WhatsApp with the Simple APK!`
    );
  };

  const handleSyncPhoneContacts = async () => {
    const navAny = navigator as any;
    if (navAny.contacts && typeof navAny.contacts.select === 'function') {
      try {
        const picked = await navAny.contacts.select(['name', 'tel', 'email'], { multiple: true });
        if (Array.isArray(picked) && picked.length > 0) {
          let syncedCount = 0;
          let matchedOnAppCount = 0;
          picked.forEach((p: any, idx: number) => {
            const rawName = (Array.isArray(p.name) ? p.name[0] : p.name) || 'Contact';
            const rawTel = (Array.isArray(p.tel) ? p.tel[0] : p.tel) || '';
            const rawEmail = (Array.isArray(p.email) ? p.email[0] : p.email) || '';
            const norm = normalizePhone(rawTel);
            if (norm.length >= 6) {
              const matched = findMatchingDirectoryUser(rawTel, undefined, rawEmail);
              if (matched) matchedOnAppCount += 1;
              onSaveContact(
                {
                  id: `cnt_${Date.now()}_${idx}`,
                  savedName: String(rawName).trim() || rawTel,
                  phone: String(rawTel).trim(),
                  normalizedPhone: norm,
                  phoneHash: computePhoneHash(norm),
                  phoneTailHash: computePhoneTailHash(norm),
                  username:
                    matched?.username ||
                    generateDefaultUsername(String(rawName), String(rawTel), String(rawEmail)),
                  email: String(rawEmail).trim().toLowerCase() || matched?.email || '',
                  matchedUserUid: matched?.uid || deriveUidFromPhone(norm),
                  addedAt: Date.now(),
                },
                false
              );
              syncedCount += 1;
            }
          });
          showDirToast(
            `Synced ${syncedCount} phone contacts (${matchedOnAppCount} already on Simple!)`
          );
          setActiveTab('contacts');
          return;
        }
      } catch {
        // User cancelled or Contact Picker unsupported in this WebView context
      }
    }
    setActiveTab('contacts');
    showDirToast('Add your phone contacts below or import to match friends on Simple');
  };

  const openWhatsAppApkInvite = (targetPhone?: string, targetName?: string) => {
    const cleanDigits = normalizePhone(targetPhone || '');
    const apkUrl = `${getRemoteServerOrigin()}/Simple-Android-v6.0.0.apk`;
    const inviteText = `Hey${targetName ? ` ${targetName}` : ''}! I'm using Simple Messenger for private end-to-end encrypted chats & calls. Download and install the Simple Android APK here to message me (@${currentAccount.username}): ${apkUrl}`;
    const waUrl =
      cleanDigits.length >= 7
        ? `https://wa.me/${cleanDigits}?text=${encodeURIComponent(inviteText)}`
        : `https://wa.me/?text=${encodeURIComponent(inviteText)}`;
    window.location.href = waUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2.5 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 p-4 sm:p-6 text-slate-100 shadow-2xl space-y-4 max-h-[92vh] flex flex-col relative">
        {/* Feedback Toast inside Directory Modal */}
        {directoryToast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-xl bg-slate-900 border border-emerald-500/60 text-xs font-semibold text-emerald-300 shadow-2xl">
            {directoryToast}
          </div>
        )}

        {/* Top Modal Header OR Multi-Select Contacts Action Bar */}
        {hasMultiSelection ? (
          <div className="p-3 rounded-2xl bg-emerald-950/95 border border-emerald-500/40 space-y-2.5 shrink-0 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearMultiSelection}
                  className="min-h-[36px] px-2.5 rounded-xl bg-emerald-900/70 hover:bg-emerald-800 text-emerald-200 text-xs font-semibold flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  <span>Done</span>
                </button>
                <span className="text-xs sm:text-sm font-bold text-white">
                  {selectedUserUids.length} Contact{selectedUserUids.length === 1 ? '' : 's'} Selected
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'lookup') {
                      const allUids = filteredDirectory.map((u) => u.uid);
                      if (
                        allUids.length > 0 &&
                        allUids.every((id) => selectedUserUids.includes(id))
                      ) {
                        setSelectedUserUids([]);
                      } else {
                        setSelectedUserUids(allUids);
                      }
                    } else if (activeTab === 'contacts') {
                      const allSavedIds = savedContacts.map((c) => c.id);
                      const allUids = savedContacts.map(
                        (c) => c.matchedUserUid || deriveUidFromPhone(c.normalizedPhone)
                      );
                      if (
                        allSavedIds.length > 0 &&
                        allSavedIds.every((id) => selectedSavedContactIds.includes(id))
                      ) {
                        setSelectedSavedContactIds([]);
                        setSelectedUserUids([]);
                      } else {
                        setSelectedSavedContactIds(allSavedIds);
                        setSelectedUserUids(allUids);
                      }
                    }
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-500/30 text-[11px] font-semibold text-emerald-200 flex items-center gap-1"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Select All / None</span>
                </button>

                {/* 3-Dots Top Action Menu for Selected Contacts (Viewport-Safe Sheet) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSelectionMoreMenu((v) => !v)}
                    className={`min-h-[34px] min-w-[34px] px-2 rounded-xl border text-xs font-semibold flex items-center justify-center transition-colors ${
                      showSelectionMoreMenu
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-900 border-emerald-500/40 text-emerald-200 hover:bg-slate-800'
                    }`}
                    title="All actions for selected contacts"
                    aria-label="More actions for selected contacts"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showSelectionMoreMenu && (
                    <div
                      onClick={() => setShowSelectionMoreMenu(false)}
                      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
                    >
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-3.5 text-xs space-y-1 my-auto"
                      >
                        <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-1.5 sm:hidden" />
                        <div className="px-2 py-1.5 text-xs font-bold text-emerald-400 border-b border-slate-800 flex items-center justify-between">
                          <span>Contact Actions ({selectedUserUids.length} selected)</span>
                          <button
                            type="button"
                            onClick={() => setShowSelectionMoreMenu(false)}
                            className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const selectedUsers = directoryUsers.filter((u) =>
                              selectedUserUids.includes(u.uid)
                            );
                            if (selectedUsers.length === 1) {
                              onStartChatWithUser(selectedUsers[0]);
                              onClose();
                            } else if (selectedUsers.length > 1) {
                              selectedUsers.forEach((u) => onStartChatWithUser(u));
                              showDirToast(`Opened chats with ${selectedUsers.length} contacts!`);
                              clearMultiSelection();
                              onClose();
                            }
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {selectedUserUids.length === 1
                              ? 'Open Chat'
                              : `Message All (${selectedUserUids.length})`}
                          </span>
                        </button>

                        {onCreateGroupWithUsers && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowBatchGroupPrompt(true);
                              setShowSelectionMoreMenu(false);
                            }}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                          >
                            <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                            <span>Create Group with Selected ({selectedUserUids.length})</span>
                          </button>
                        )}

                        {onStartCallWithUser && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const selectedUsers = directoryUsers.filter(
                                  (u) =>
                                    selectedUserUids.includes(u.uid) &&
                                    u.uid !== currentAccount.id
                                );
                                if (selectedUsers.length === 0) {
                                  showDirToast('Select at least one other contact to call');
                                  return;
                                }
                                onStartCallWithUser(
                                  selectedUsers[0],
                                  'audio',
                                  selectedUsers.slice(1)
                                );
                                onClose();
                              }}
                              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                            >
                              <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>
                                {selectedUserUids.length > 1
                                  ? `Group Voice Call (${selectedUserUids.length})`
                                  : 'Start Voice Call'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const selectedUsers = directoryUsers.filter(
                                  (u) =>
                                    selectedUserUids.includes(u.uid) &&
                                    u.uid !== currentAccount.id
                                );
                                if (selectedUsers.length === 0) {
                                  showDirToast('Select at least one other contact to call');
                                  return;
                                }
                                onStartCallWithUser(
                                  selectedUsers[0],
                                  'video',
                                  selectedUsers.slice(1)
                                );
                                onClose();
                              }}
                              className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                            >
                              <Video className="w-4 h-4 text-cyan-400 shrink-0" />
                              <span>
                                {selectedUserUids.length > 1
                                  ? `Group Video Call (${selectedUserUids.length})`
                                  : 'Start Video Call'}
                              </span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const selectedUsers = directoryUsers.filter((u) =>
                              selectedUserUids.includes(u.uid)
                            );
                            selectedUsers.forEach((u, idx) => {
                              const normPhone =
                                normalizePhone(
                                  u.normalizedPhone !== 'REDACTED_SHA256' ? u.phone : ''
                                ) || `${Date.now() + idx}`.slice(-10);
                              onSaveContact(
                                {
                                  id: `cnt_${Date.now()}_${idx}`,
                                  savedName: u.name,
                                  phone: u.phone,
                                  normalizedPhone: normPhone,
                                  phoneHash: u.phoneHash || computePhoneHash(normPhone),
                                  phoneTailHash:
                                    u.phoneTailHash || computePhoneTailHash(normPhone),
                                  username: u.username,
                                  email: u.email,
                                  matchedUserUid: u.uid,
                                  addedAt: Date.now(),
                                },
                                false
                              );
                            });
                            showDirToast(
                              `Saved ${selectedUsers.length} contact(s) to your address book!`
                            );
                            clearMultiSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <UserPlus className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Save to My Contacts ({selectedUserUids.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const selectedUsers = directoryUsers.filter((u) =>
                              selectedUserUids.includes(u.uid)
                            );
                            const text = selectedUsers
                              .map((u) => `${u.name} (@${u.username}) · ${u.phone}`)
                              .join('\n');
                            navigator.clipboard.writeText(text);
                            showDirToast(`Copied ${selectedUsers.length} contact(s)!`);
                            clearMultiSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Copy className="w-4 h-4 text-slate-300 shrink-0" />
                          <span>Copy Contact Details ({selectedUserUids.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const selectedUsers = directoryUsers.filter((u) =>
                              selectedUserUids.includes(u.uid)
                            );
                            const text = selectedUsers
                              .map((u) => `${u.name} (@${u.username}) · ${u.phone}`)
                              .join('\n');
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: 'Contacts',
                                  text,
                                });
                              } catch {
                                navigator.clipboard.writeText(text);
                                showDirToast('Copied contact cards for sharing!');
                              }
                            } else {
                              navigator.clipboard.writeText(text);
                              showDirToast('Copied contact cards for sharing!');
                            }
                            clearMultiSelection();
                          }}
                          className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center gap-2.5 text-left text-slate-200"
                        >
                          <Share2 className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span>Share Contact Cards ({selectedUserUids.length})</span>
                        </button>

                        {selectedSavedContactIds.length > 0 && (
                          <>
                            <div className="border-t border-slate-800 my-1" />
                            <button
                              type="button"
                              onClick={() => {
                                selectedSavedContactIds.forEach((id) =>
                                  onDeleteSavedContact(id)
                                );
                                showDirToast(
                                  `Deleted ${selectedSavedContactIds.length} saved contact(s)`
                                );
                                clearMultiSelection();
                              }}
                              className="w-full px-3 py-2.5 rounded-xl hover:bg-rose-500/15 flex items-center gap-2.5 text-left text-rose-400 font-semibold"
                            >
                                <Trash2 className="w-4 h-4 shrink-0" />
                                <span>Delete Saved Contacts ({selectedSavedContactIds.length})</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </div>

            {/* Batch Actions Row for Selected Contacts */}
            {selectedUserUids.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-500/20">
                <button
                  type="button"
                  onClick={() => {
                    const selectedUsers = directoryUsers.filter((u) =>
                      selectedUserUids.includes(u.uid)
                    );
                    if (selectedUsers.length === 1) {
                      onStartChatWithUser(selectedUsers[0]);
                      onClose();
                    } else if (selectedUsers.length > 1) {
                      selectedUsers.forEach((u) => onStartChatWithUser(u));
                      showDirToast(`Opened chats with ${selectedUsers.length} contacts!`);
                      clearMultiSelection();
                      onClose();
                    }
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>
                    {selectedUserUids.length === 1
                      ? 'Message'
                      : `Message All (${selectedUserUids.length})`}
                  </span>
                </button>

                {onCreateGroupWithUsers && selectedUserUids.length >= 1 && (
                  <button
                    type="button"
                    onClick={() => setShowBatchGroupPrompt((v) => !v)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>New Group ({selectedUserUids.length})</span>
                  </button>
                )}

                {onStartCallWithUser && (
                  <button
                    type="button"
                    onClick={() => {
                      const selectedUsers = directoryUsers.filter(
                        (u) => selectedUserUids.includes(u.uid) && u.uid !== currentAccount.id
                      );
                      if (selectedUsers.length === 0) {
                        showDirToast('Select at least one other contact to call');
                        return;
                      }
                      onStartCallWithUser(
                        selectedUsers[0],
                        'audio',
                        selectedUsers.slice(1)
                      );
                      onClose();
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>
                      {selectedUserUids.length > 1 ? 'Group Voice Call' : 'Voice Call'}
                    </span>
                  </button>
                )}

                {onStartCallWithUser && (
                  <button
                    type="button"
                    onClick={() => {
                      const selectedUsers = directoryUsers.filter(
                        (u) => selectedUserUids.includes(u.uid) && u.uid !== currentAccount.id
                      );
                      if (selectedUsers.length === 0) {
                        showDirToast('Select at least one other contact to call');
                        return;
                      }
                      onStartCallWithUser(
                        selectedUsers[0],
                        'video',
                        selectedUsers.slice(1)
                      );
                      onClose();
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>
                      {selectedUserUids.length > 1 ? 'Group Video Call' : 'Video Call'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const selectedUsers = directoryUsers.filter((u) =>
                      selectedUserUids.includes(u.uid)
                    );
                    selectedUsers.forEach((u, idx) => {
                      const normPhone =
                        normalizePhone(u.normalizedPhone !== 'REDACTED_SHA256' ? u.phone : '') ||
                        `${Date.now() + idx}`.slice(-10);
                      onSaveContact(
                        {
                          id: `cnt_${Date.now()}_${idx}`,
                          savedName: u.name,
                          phone: u.phone,
                          normalizedPhone: normPhone,
                          phoneHash: u.phoneHash || computePhoneHash(normPhone),
                          phoneTailHash: u.phoneTailHash || computePhoneTailHash(normPhone),
                          username: u.username,
                          email: u.email,
                          matchedUserUid: u.uid,
                          addedAt: Date.now(),
                        },
                        false
                      );
                    });
                    showDirToast(`Saved ${selectedUsers.length} contact(s) to your address book!`);
                    clearMultiSelection();
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Save to Contacts</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const selectedUsers = directoryUsers.filter((u) =>
                      selectedUserUids.includes(u.uid)
                    );
                    const text = selectedUsers
                      .map((u) => `${u.name} (@${u.username}) · ${u.phone}`)
                      .join('\n');
                    navigator.clipboard.writeText(text);
                    showDirToast(`Copied ${selectedUsers.length} contact(s)!`);
                    clearMultiSelection();
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Copy Info</span>
                </button>

                {selectedSavedContactIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      selectedSavedContactIds.forEach((id) => onDeleteSavedContact(id));
                      showDirToast(`Deleted ${selectedSavedContactIds.length} saved contact(s)`);
                      clearMultiSelection();
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete ({selectedSavedContactIds.length})</span>
                  </button>
                )}
              </div>
            )}

            {/* Quick Inline Group Creation Input when "New Group" is clicked */}
            {showBatchGroupPrompt && onCreateGroupWithUsers && (
              <div className="flex items-center gap-2 pt-2 border-t border-emerald-500/20">
                <input
                  type="text"
                  value={batchGroupNameInput}
                  onChange={(e) => setBatchGroupNameInput(e.target.value)}
                  placeholder="Enter group name (e.g. Project Team, Family)…"
                  className="flex-1 rounded-xl bg-slate-950 border border-emerald-500/40 px-3 py-1.5 text-xs text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const selectedUsers = directoryUsers.filter((u) =>
                      selectedUserUids.includes(u.uid)
                    );
                    const finalName =
                      batchGroupNameInput.trim() ||
                      `Group (${selectedUsers.map((u) => u.name.split(' ')[0]).join(', ')})`;
                    onCreateGroupWithUsers(finalName, selectedUsers);
                    setBatchGroupNameInput('');
                    clearMultiSelection();
                    onClose();
                  }}
                  className="min-h-[34px] px-3.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-bold"
                >
                  Create Group
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3.5 shrink-0">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Contacts & User Directory
              </h2>
              <p className="text-xs text-slate-400">
                Find friends by <strong>Phone Number</strong>, <strong>@username</strong>, or <strong>Email</strong> — hold or tap <strong>Select</strong> for multiple contacts.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              <button
                type="button"
                onClick={handleSyncPhoneContacts}
                className="min-h-[38px] px-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                title="Sync contacts from your phone and match who uses Simple"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Sync Contacts</span>
              </button>
              <button
                type="button"
                onClick={() => shareSimpleApk(currentAccount.username)}
                className="min-h-[38px] px-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center gap-1.5"
                title="Share Simple APK on WhatsApp or any app"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share APK</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMultiSelectMode(true)}
                className="min-h-[38px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                title="Select multiple contacts"
              >
                <CheckSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Select</span>
              </button>
              <button
                onClick={onClose}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 shrink-0"
                aria-label="Close directory"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Navigation Tabs (Responsive on all devices so no tab text is cut) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 shrink-0">
          <button
            onClick={() => setActiveTab('lookup')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'lookup'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Find by Phone / @User / Email
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'contacts'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            2. Save Mobile Number ({savedContacts.length})
          </button>
          <button
            onClick={() => setActiveTab('accounts')}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'accounts'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            3. My Profile & @Username
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 pb-2">
          {/* TAB 1: GLOBAL SEARCH BY PHONE, USERNAME, OR EMAIL */}
          {activeTab === 'lookup' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter mobile number (+91 98765 43210), @username (@priya.k), or email…"
                  className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 px-1">
                  <span>Registered Simple Users ({filteredDirectory.length})</span>
                  <span className="text-emerald-400/90">
                    Tip: Long-press or tap ⋮ on any user for full options
                  </span>
                </div>

                {filteredDirectory.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-200">
                      {searchQuery
                        ? `No registered account found for "${searchQuery}" yet`
                        : 'No other registered users in directory yet'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {searchQuery
                        ? `Save ${searchQuery} to your contacts or share the Simple APK with them on WhatsApp so they can install Simple and chat with you!`
                        : 'Sync your phone contacts or share the Simple APK with your friends on WhatsApp to start chatting!'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {searchQuery && (
                        <button
                          onClick={() => {
                            setContactPhone(searchQuery);
                            setActiveTab('contacts');
                          }}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <UserPlus className="w-4 h-4" />
                          Save "{searchQuery}" & Message
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openWhatsAppApkInvite(searchQuery)}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Share2 className="w-4 h-4" />
                        Share APK on WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => shareSimpleApk(currentAccount.username)}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Share2 className="w-4 h-4 text-cyan-400" />
                        Share Whole APK File
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-950/80 border border-slate-800">
                    {filteredDirectory.map((user) => {
                      const isSelf = user.uid === currentAccount.id;
                      const isSelected = selectedUserUids.includes(user.uid);
                      return (
                        <div
                          key={user.uid}
                          onClick={() => {
                            if (hasMultiSelection) {
                              toggleSelectDirectoryUser(user.uid);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            navigator.vibrate?.(15);
                            setIsMultiSelectMode(true);
                            toggleSelectDirectoryUser(user.uid);
                          }}
                          onTouchStart={() => startLongPress({ user })}
                          onTouchEnd={cancelLongPress}
                          onTouchMove={cancelLongPress}
                          onTouchCancel={cancelLongPress}
                          onPointerDown={(e) => {
                            if (e.pointerType === 'mouse' && e.button === 0) {
                              startLongPress({ user });
                            }
                          }}
                          onPointerUp={cancelLongPress}
                          onPointerLeave={cancelLongPress}
                          className={`p-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/15'
                              : 'hover:bg-slate-900/70'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {hasMultiSelection && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSelectDirectoryUser(user.uid);
                                }}
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                    : 'bg-slate-900 border-slate-600 text-transparent hover:border-emerald-400'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </button>
                            )}
                            <UserAvatar
                              name={user.name}
                              avatarUrl={isSelf ? currentAccount.avatarUrl || user.avatarUrl : user.avatarUrl}
                              avatarColor={user.avatarColor}
                              sizeClass="w-11 h-11"
                            />
                            <div className="min-w-0 space-y-0.5 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-white truncate">
                                  {user.name} {isSelf && '(You)'}
                                </span>
                                <span className="text-[11px] text-emerald-400 flex items-center gap-0.5 font-medium shrink-0">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  On Simple
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 font-mono">
                                <span className="inline-flex items-center gap-1 text-emerald-300">
                                  <AtSign className="w-3 h-3" />
                                  {user.username}
                                </span>
                                <span className="inline-flex items-center gap-1 text-cyan-300">
                                  <Phone className="w-3 h-3" />
                                  {isSelf
                                    ? currentAccount.phone
                                    : user.hidePhoneNumber || user.normalizedPhone === 'REDACTED_SHA256'
                                    ? `${maskPhoneForFirestore(user.phone)} (Private)`
                                    : user.phone}
                                </span>
                                {user.email && (
                                  <span className="inline-flex items-center gap-1 text-slate-400">
                                    <Mail className="w-3 h-3" />
                                    {user.email}
                                  </span>
                                )}
                              </div>
                              {user.about && (
                                <p className="text-[11px] text-slate-400 truncate">
                                  {user.about}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartChatWithUser(user);
                                onClose();
                              }}
                              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Message
                            </button>

                            {onStartCallWithUser && !isSelf && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartCallWithUser(user, 'audio');
                                  onClose();
                                }}
                                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 flex items-center justify-center"
                                title={`Encrypted Voice Call with ${user.name}`}
                                aria-label={`Voice call ${user.name}`}
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                            )}

                            {/* 3-Dots Directory Options Button (Opens Viewport-Safe Modal — Never Cut!) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDirectoryTarget({ user });
                              }}
                              className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
                              title="More options (or long-press row)"
                              aria-label={`More options for ${user.name}`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SAVE ANYONE WITH MOBILE PHONE NUMBER & MESSAGE SPECIFIC USER */}
          {activeTab === 'contacts' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    Save Contact by Mobile Phone Number
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Auto-matches if they have Simple
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Mobile Phone Number *
                    </label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210 or +1 415-890-2211"
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Contact Display Name
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder={
                        liveMatchedContactUser
                          ? liveMatchedContactUser.name
                          : 'e.g. Priya Sharma'
                      }
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      @Username (Optional)
                    </label>
                    <input
                      type="text"
                      value={contactUsername}
                      onChange={(e) => setContactUsername(e.target.value)}
                      placeholder={
                        liveMatchedContactUser
                          ? `@${liveMatchedContactUser.username}`
                          : 'Auto-linked if registered'
                      }
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder={
                        liveMatchedContactUser
                          ? liveMatchedContactUser.email
                          : 'friend@example.com'
                      }
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Live Phone Number Match Indicator */}
                {liveMatchedContactUser && (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        <strong>Matched Simple Account!</strong> This mobile number belongs to{' '}
                        <strong>{liveMatchedContactUser.name}</strong> (@
                        {liveMatchedContactUser.username}).
                      </span>
                    </div>
                  </div>
                )}

                {contactFeedback && (
                  <p className="text-xs text-emerald-400 font-medium">{contactFeedback}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => handleSaveContactSubmit(true)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Save Mobile Number & Start Chat Now
                  </button>
                  <button
                    onClick={() => handleSaveContactSubmit(false)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                  >
                    Save to Contact Book Only
                  </button>
                </div>
              </div>

              {/* Saved Contacts List */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <h4 className="text-xs font-semibold text-slate-400">
                    Your Saved Mobile Contacts ({savedContacts.length})
                  </h4>
                  <span className="text-[11px] text-emerald-400/90">
                    Hold or tap ⋮ for Contact Options
                  </span>
                </div>
                <div className="divide-y divide-slate-800 rounded-2xl bg-slate-950 border border-slate-800">
                  {savedContacts.map((cnt) => {
                    const matchedUser = findMatchingDirectoryUser(
                      cnt.phone,
                      cnt.username,
                      cnt.email
                    );
                    const resolvedUser: DirectoryUser = matchedUser || {
                      uid: cnt.matchedUserUid || deriveUidFromPhone(cnt.normalizedPhone),
                      name: cnt.savedName,
                      username:
                        cnt.username ||
                        generateDefaultUsername(cnt.savedName, cnt.phone, cnt.email),
                      phone: cnt.phone,
                      normalizedPhone: cnt.normalizedPhone,
                      phoneHash: cnt.phoneHash || computePhoneHash(cnt.normalizedPhone),
                      phoneTailHash: cnt.phoneTailHash || computePhoneTailHash(cnt.normalizedPhone),
                      email: cnt.email || '',
                      emailHash: computeEmailHash(cnt.email),
                      about: 'Connected via Mobile Number on Simple',
                      avatarColor: '#10B981',
                      identityFingerprint:
                        '6C83F512A9D04E7B3C618290F4E1D2C3B4A5908F4A2C91E0B73D55A9D4E2A17B',
                      allowUsernameDiscovery: true,
                      hidePhoneNumber: false,
                      isOnline: true,
                      lastSeen: 'Online',
                      updatedAt: Date.now(),
                    };

                    const isSavedSelected =
                      selectedSavedContactIds.includes(cnt.id) ||
                      selectedUserUids.includes(resolvedUser.uid);

                    return (
                      <div
                        key={cnt.id}
                        onClick={() => {
                          if (hasMultiSelection) {
                            toggleSelectDirectoryUser(resolvedUser.uid, cnt.id);
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          navigator.vibrate?.(15);
                          setIsMultiSelectMode(true);
                          toggleSelectDirectoryUser(resolvedUser.uid, cnt.id);
                        }}
                        onTouchStart={() =>
                          startLongPress({
                            user: resolvedUser,
                            savedContactId: cnt.id,
                            customSavedName: cnt.savedName,
                          })
                        }
                        onTouchEnd={cancelLongPress}
                        onTouchMove={cancelLongPress}
                        onTouchCancel={cancelLongPress}
                        onPointerDown={(e) => {
                          if (e.pointerType === 'mouse' && e.button === 0) {
                            startLongPress({
                              user: resolvedUser,
                              savedContactId: cnt.id,
                              customSavedName: cnt.savedName,
                            });
                          }
                        }}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        className={`p-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors cursor-pointer ${
                          isSavedSelected ? 'bg-emerald-500/15' : 'hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {hasMultiSelection && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectDirectoryUser(resolvedUser.uid, cnt.id);
                              }}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isSavedSelected
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                  : 'bg-slate-900 border-slate-600 text-transparent hover:border-emerald-400'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          )}
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate">
                                {cnt.savedName}
                              </span>
                              {matchedUser ? (
                                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  On Simple (@{matchedUser.username})
                                </span>
                              ) : (
                                <span className="text-[11px] text-amber-300 font-medium">
                                  Not on Simple yet · Invite with APK
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-mono text-slate-400 flex flex-wrap gap-3">
                              <span className="text-cyan-300">{cnt.phone}</span>
                              {cnt.username && <span>@{cnt.username}</span>}
                              {cnt.email && <span>{cnt.email}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {!matchedUser && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openWhatsAppApkInvite(cnt.phone, cnt.savedName);
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                              title={`Send Simple APK invite to ${cnt.savedName} on WhatsApp`}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>Share APK on WhatsApp</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartChatWithUser(resolvedUser, cnt.savedName);
                              onClose();
                            }}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-semibold flex items-center gap-1.5"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Message</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDirectoryTarget({
                                user: resolvedUser,
                                savedContactId: cnt.id,
                                customSavedName: cnt.savedName,
                              });
                            }}
                            className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
                            aria-label="Contact options"
                            title="Contact options (or long-press)"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSavedContact(cnt.id);
                            }}
                            className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 flex items-center justify-center"
                            aria-label="Delete saved contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CREATE USERNAME FROM PHONE / EMAIL & SWITCH ACTIVE ACCOUNT */}
          {activeTab === 'accounts' && (
            <div className="space-y-5">
              {/* Current Active User Card */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="text-xs font-semibold text-emerald-300">
                  Your Active Simple Identity (Discoverable by Friends)
                </div>
                <div className="grid sm:grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">@Username</div>
                    <div className="text-emerald-300 font-semibold mt-0.5">
                      @{currentAccount.username}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Mobile Number</div>
                    <div className="text-cyan-300 font-semibold mt-0.5">
                      {currentAccount.phone}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 text-[10px]">Email</div>
                    <div className="text-slate-200 font-semibold mt-0.5 truncate">
                      {currentAccount.email || 'Not set'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Security & Verified Ownership Notice */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Strict Account Protection Active</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your account (@{currentAccount.username}) is cryptographically bound to your verified identity and protected by your Account Password and 6-Digit Two-Step Verification PIN. Account switching without full password + real OTP/Authenticator verification is disabled.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ==========================================================================
            VIEWPORT-SAFE DIRECTORY USER / CONTACT LONG-PRESS & 3-DOTS ACTION MODAL
            (Renders in fixed z-[60] overlay so options are NEVER cut or hidden!)
           ========================================================================== */}
        {selectedDirectoryTarget && (
          <div
            onClick={() => setSelectedDirectoryTarget(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 p-5 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto text-slate-100"
            >
              {/* User Identity Header */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
                    style={{ backgroundColor: selectedDirectoryTarget.user.avatarColor }}
                  >
                    {selectedDirectoryTarget.user.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {selectedDirectoryTarget.customSavedName ||
                        selectedDirectoryTarget.user.name}
                    </div>
                    <div className="text-xs font-mono text-emerald-400 truncate">
                      @{selectedDirectoryTarget.user.username} ·{' '}
                      {selectedDirectoryTarget.user.phone}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDirectoryTarget(null)}
                  className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Primary Communication Actions */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onStartChatWithUser(
                      selectedDirectoryTarget.user,
                      selectedDirectoryTarget.customSavedName
                    );
                    setSelectedDirectoryTarget(null);
                    onClose();
                  }}
                  className="col-span-2 min-h-[42px] px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Open Encrypted Chat</span>
                </button>

                {onStartCallWithUser &&
                  selectedDirectoryTarget.user.uid !== currentAccount.id && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onStartCallWithUser(selectedDirectoryTarget.user, 'audio');
                          setSelectedDirectoryTarget(null);
                          onClose();
                        }}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold flex items-center justify-center gap-2"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Voice Call</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onStartCallWithUser(selectedDirectoryTarget.user, 'video');
                          setSelectedDirectoryTarget(null);
                          onClose();
                        }}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold flex items-center justify-center gap-2"
                      >
                        <Video className="w-4 h-4" />
                        <span>Video Call</span>
                      </button>
                    </>
                  )}
              </div>

              {/* Full Directory & Contact Actions List */}
              <div className="space-y-1 text-xs border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    const u = selectedDirectoryTarget.user;
                    const savedId = selectedDirectoryTarget.savedContactId;
                    setIsMultiSelectMode(true);
                    toggleSelectDirectoryUser(u.uid, savedId);
                    setSelectedDirectoryTarget(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-left text-emerald-300 font-semibold"
                >
                  <span className="flex items-center gap-2.5">
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                    <span>Select Multiple Contacts</span>
                  </span>
                  <span className="text-[11px] text-emerald-400">Multi-Select</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const u = selectedDirectoryTarget.user;
                    const normPhone =
                      normalizePhone(u.normalizedPhone !== 'REDACTED_SHA256' ? u.phone : '') ||
                      `${Date.now()}`.slice(-10);
                    const newSaved: SavedContact = {
                      id: `cnt_${Date.now()}`,
                      savedName: u.name,
                      phone: u.phone,
                      normalizedPhone: normPhone,
                      phoneHash: u.phoneHash || computePhoneHash(normPhone),
                      phoneTailHash: u.phoneTailHash || computePhoneTailHash(normPhone),
                      username: u.username,
                      email: u.email,
                      matchedUserUid: u.uid,
                      addedAt: Date.now(),
                    };
                    onSaveContact(newSaved, false);
                    showDirToast(`Saved ${u.name} (@${u.username}) to Contacts!`);
                    setSelectedDirectoryTarget(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <UserPlus className="w-4 h-4 text-emerald-400" />
                    <span>Save to Contacts</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Add</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`@${selectedDirectoryTarget.user.username}`);
                    showDirToast(`Copied @${selectedDirectoryTarget.user.username}`);
                    setSelectedDirectoryTarget(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <AtSign className="w-4 h-4 text-emerald-400" />
                    <span>Copy @Username</span>
                  </span>
                  <span className="font-mono text-[11px] text-emerald-300">
                    @{selectedDirectoryTarget.user.username}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedDirectoryTarget.user.phone);
                    showDirToast(`Copied number ${selectedDirectoryTarget.user.phone}`);
                    setSelectedDirectoryTarget(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <Copy className="w-4 h-4 text-cyan-400" />
                    <span>Copy Mobile Number</span>
                  </span>
                  <span className="font-mono text-[11px] text-cyan-300">
                    {selectedDirectoryTarget.user.phone}
                  </span>
                </button>

                {selectedDirectoryTarget.user.email && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedDirectoryTarget.user.email);
                      showDirToast(`Copied email ${selectedDirectoryTarget.user.email}`);
                      setSelectedDirectoryTarget(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span>Copy Email Address</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-300 truncate max-w-[160px]">
                      {selectedDirectoryTarget.user.email}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const u = selectedDirectoryTarget.user;
                    const cardText = `${u.name} (@${u.username}) · ${u.phone}`;
                    navigator.clipboard.writeText(cardText);
                    showDirToast('Copied Contact Card');
                    setSelectedDirectoryTarget(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800 flex items-center justify-between text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <Share2 className="w-4 h-4 text-indigo-400" />
                    <span>Share Contact Info</span>
                  </span>
                  <span className="text-[11px] text-slate-400">Copy</span>
                </button>

                {selectedDirectoryTarget.savedContactId && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteSavedContact(selectedDirectoryTarget.savedContactId!);
                      showDirToast('Removed from Saved Contacts');
                      setSelectedDirectoryTarget(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-rose-500/20 text-rose-300 flex items-center justify-between text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <Trash2 className="w-4 h-4" />
                      <span>Delete from Saved Contacts</span>
                    </span>
                  </button>
                )}
              </div>

              {/* Clean Contact Profile Summary Footer */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">About:</span>
                  <span className="text-white font-medium truncate max-w-[220px]">
                    {selectedDirectoryTarget.user.about || 'Available on Simple'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Privacy:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    End-to-End Encrypted
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
