import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  MessageSquare,
  MoreVertical,
  QrCode,
  Search,
  Share2,
  Sparkles,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ChatConversation,
  DirectoryUser,
  FriendRequest,
  UserAccount,
  UserRecommendation,
} from '../types/simple';
import { UserAvatar } from './ProfilePhotoModal';
import { apiFetch } from '../utils/androidBridge';
import { ShareMeModal } from './ShareMeModal';

interface FriendsDiscoveryViewProps {
  account: UserAccount;
  onOpenChatWithUser: (user: DirectoryUser) => void;
  onShowShareModal: () => void;
}

export const FriendsDiscoveryView: React.FC<FriendsDiscoveryViewProps> = ({
  account,
  onOpenChatWithUser,
  onShowShareModal,
}) => {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'requests' | 'friends'>('suggestions');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<DirectoryUser & { isFriend: boolean; requestSent: boolean; hasIncomingRequest: boolean; incomingRequestId?: string }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  const [recommendations, setRecommendations] = useState<UserRecommendation[]>([]);
  const [friendsList, setFriendsList] = useState<DirectoryUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showFeedback = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const loadData = async () => {
    if (!account.id) return;
    setLoading(true);
    try {
      // 1. Load friends and requests
      const friendsRes = await apiFetch(`/api/friends/list?uid=${encodeURIComponent(account.id)}`);
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriendsList(data.friends || []);
        setIncomingRequests(data.incomingRequests || []);
        setOutgoingRequests(data.outgoingRequests || []);
      }

      // 2. Load recommendations
      const recsRes = await apiFetch(`/api/friends/recommendations?myUid=${encodeURIComponent(account.id)}`);
      if (recsRes.ok) {
        const data = await recsRes.json();
        setRecommendations(data.recommendations || []);
      }
    } catch (err) {
      console.error('Failed to load friends/recommendations data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [account.id]);

  // Handle Search
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase().replace(/^@/, '');
    if (!query) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/api/users/search?q=${encodeURIComponent(query)}&myUid=${encodeURIComponent(account.id)}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.users || []);
        }
      } catch (err) {
        console.error('Search failed', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchQuery, account.id]);

  const handleSendFriendRequest = async (targetUid: string, targetUsername: string) => {
    try {
      const res = await apiFetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUid: account.id,
          toUid: targetUid,
          toUsername: targetUsername,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showFeedback(data.message || `Friend request sent to @${targetUsername}!`);
        loadData();
      } else {
        showFeedback(data.error || 'Could not send request', 'error');
      }
    } catch {
      showFeedback('Network error sending request', 'error');
    }
  };

  const handleRespondToRequest = async (requestId: string, action: 'accept' | 'decline') => {
    try {
      const res = await apiFetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action,
          myUid: account.id,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showFeedback(data.message || (action === 'accept' ? 'Friend request accepted!' : 'Declined'));
        loadData();
      } else {
        showFeedback(data.error || 'Failed to respond to request', 'error');
      }
    } catch {
      showFeedback('Network error responding to request', 'error');
    }
  };

  const handleRemoveFriend = async (friendUid: string, friendUsername: string) => {
    if (!confirm(`Are you sure you want to remove @${friendUsername} from your friends?`)) return;
    try {
      const res = await apiFetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          myUid: account.id,
          friendUid,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showFeedback(`Removed @${friendUsername} from friends`, 'info');
        loadData();
      }
    } catch {
      showFeedback('Could not remove friend', 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      {/* Top Header */}
      <div className="px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-20 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-tr from-pink-500/20 via-purple-500/20 to-emerald-500/20 border border-purple-500/30 rounded-xl text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Connect & Discover</h1>
              <p className="text-xs text-slate-400">Make friends, send requests & chat</p>
            </div>
          </div>

          <button
            onClick={onShowShareModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Share Me</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by @username or profile name..."
            className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Instagram-style Segmented Tabs */}
        {!searchQuery && (
          <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'suggestions'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Suggested for You</span>
            </button>

            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 relative ${
                activeTab === 'requests'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Requests</span>
              {incomingRequests.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold">
                  {incomingRequests.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('friends')}
              className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'friends'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Friends ({friendsList.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating Feedback Alert */}
      {feedbackMessage && (
        <div
          className={`mx-4 mt-3 p-3 rounded-xl text-xs font-medium border flex items-center gap-2 animate-fade-in ${
            feedbackMessage.type === 'error'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {feedbackMessage.type === 'error' ? (
            <X className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* SEARCH RESULTS VIEW */}
        {searchQuery ? (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Search Results {searchResults.length > 0 && `(${searchResults.length})`}
            </h2>

            {isSearching ? (
              <div className="text-center py-10 text-slate-500 text-xs">Searching users...</div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
                <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-300">No users found</p>
                <p className="text-xs text-slate-500 mt-1">
                  Try searching for another username or profile name.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((user) => (
                  <div
                    key={user.uid}
                    className="p-3.5 rounded-2xl bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        name={user.name}
                        avatarUrl={user.avatarUrl}
                        avatarColor={user.avatarColor}
                        sizeClass="w-11 h-11"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-white truncate">{user.name}</p>
                          {user.isOnline && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-emerald-400 font-mono truncate">
                          @{user.username}
                        </p>
                        {user.about && (
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">
                            {user.about}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {user.isFriend ? (
                        <button
                          onClick={() => onOpenChatWithUser(user)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Message
                        </button>
                      ) : user.hasIncomingRequest ? (
                        <button
                          onClick={() =>
                            user.incomingRequestId &&
                            handleRespondToRequest(user.incomingRequestId, 'accept')
                          }
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                      ) : user.requestSent ? (
                        <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 font-medium text-xs flex items-center gap-1 border border-slate-700">
                          <Clock className="w-3 h-3 text-amber-400" />
                          Requested
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSendFriendRequest(user.uid, user.username)}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all active:scale-95"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Add Friend
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'suggestions' ? (
          /* SUGGESTED FOR YOU (RECOMMENDATIONS) */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Suggested for You
              </h2>
              <span className="text-[11px] text-slate-500">Based on active members</span>
            </div>

            {recommendations.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
                <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-300">No suggestions right now</p>
                <p className="text-xs text-slate-500 mt-1">
                  Share your link with friends so they can join you!
                </p>
                <button
                  onClick={onShowShareModal}
                  className="mt-3 px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 hover:bg-emerald-400 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Profile Link
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recommendations.map((rec) => (
                  <div
                    key={rec.user.uid}
                    className="p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800/90 flex items-center justify-between gap-3 transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        name={rec.user.name}
                        avatarUrl={rec.user.avatarUrl}
                        avatarColor={rec.user.avatarColor}
                        sizeClass="w-11 h-11"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-white truncate">{rec.user.name}</p>
                          {rec.user.isOnline && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-emerald-400 font-mono truncate">
                          @{rec.user.username}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {rec.reason}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {rec.hasIncomingRequest ? (
                        <button
                          onClick={() =>
                            rec.incomingRequestId &&
                            handleRespondToRequest(rec.incomingRequestId, 'accept')
                          }
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                      ) : rec.requestSent ? (
                        <span className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-400 font-medium text-xs flex items-center gap-1 border border-slate-700">
                          <Clock className="w-3 h-3 text-amber-400" />
                          Requested
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSendFriendRequest(rec.user.uid, rec.user.username)}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all active:scale-95"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          Follow / Add
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'requests' ? (
          /* FRIEND REQUESTS TAB */
          <div className="space-y-5">
            {/* INCOMING REQUESTS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                  Incoming Friend Requests ({incomingRequests.length})
                </h2>
              </div>

              {incomingRequests.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 text-xs text-slate-500">
                  No incoming requests at the moment.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/30 flex items-center justify-between gap-3 shadow-md shadow-emerald-950/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar
                          name={req.fromName}
                          avatarUrl={req.fromAvatarUrl}
                          avatarColor={req.fromAvatarColor}
                          sizeClass="w-11 h-11"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{req.fromName}</p>
                          <p className="text-xs font-semibold text-emerald-400 font-mono truncate">
                            @{req.fromUsername}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Sent you a friend request
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRespondToRequest(req.id, 'accept')}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-md shadow-emerald-500/20"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Confirm
                        </button>
                        <button
                          onClick={() => handleRespondToRequest(req.id, 'decline')}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* OUTGOING REQUESTS */}
            {outgoingRequests.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Sent Requests ({outgoingRequests.length})
                </h2>
                <div className="space-y-2">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs uppercase font-mono">
                          {req.toUsername.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-300 truncate">@{req.toUsername}</p>
                          <p className="text-[11px] text-slate-500">Request pending approval</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Waiting
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* MY FRIENDS TAB */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                My Connected Friends ({friendsList.length})
              </h2>
            </div>

            {friendsList.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
                <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-300">You haven&apos;t added any friends yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Find users in &ldquo;Suggested for You&rdquo;, search by username, or share your profile link.
                </p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => setActiveTab('suggestions')}
                    className="px-3.5 py-1.5 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-emerald-400 transition-colors"
                  >
                    Browse Suggestions
                  </button>
                  <button
                    onClick={onShowShareModal}
                    className="px-3.5 py-1.5 bg-slate-800 text-emerald-400 font-semibold text-xs rounded-xl border border-emerald-500/30 hover:bg-slate-750 transition-colors"
                  >
                    Share Profile Link
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {friendsList.map((friend) => (
                  <div
                    key={friend.uid}
                    className="p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar
                        name={friend.name}
                        avatarUrl={friend.avatarUrl}
                        avatarColor={friend.avatarColor}
                        sizeClass="w-11 h-11"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-white truncate">{friend.name}</p>
                          {friend.isOnline && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-emerald-400 font-mono truncate">
                          @{friend.username}
                        </p>
                        {friend.about && (
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">
                            {friend.about}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onOpenChatWithUser(friend)}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all active:scale-95"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Message
                      </button>
                      <button
                        onClick={() => handleRemoveFriend(friend.uid, friend.username)}
                        title="Remove Friend"
                        className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
