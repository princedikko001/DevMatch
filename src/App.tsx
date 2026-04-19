import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  MessageSquare,
  Users, 
  ChevronRight, 
  Send,
  MessageCircle,
  Award,
  AlertCircle,
  CheckCircle,
  Github, 
  Mail, 
  Lock, 
  User as UserIcon,
  Briefcase,
  ExternalLink,
  CheckCircle2,
  Monitor,
  Server,
  Brain,
  BarChart3,
  Calendar,
  Building2,
  GraduationCap,
  Twitter,
  Linkedin,
  ArrowRight,
  LayoutDashboard,
  FolderKanban,
  Map,
  Settings,
  Activity,
  TrendingUp,
  Globe,
  Plus,
  Search,
  Bell,
  Menu,
  X,
  Bookmark,
  GitPullRequest,
  Clock,
  Save,
  UserPlus,
  Home as HomeIcon,
  Filter,
  Code2,
  Trash2,
  Star
} from "lucide-react";
import { 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  getDoc,
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  increment, 
  where
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { 
  matchProjects, 
  getSkillGapAnalysis, 
  getSkillRoadmap, 
  getPeerMatch,
  rankSavedProjects 
} from "./lib/gemini";
import projectsData from "./projects.json";
import { toast, Toaster } from "sonner";
import { GoogleGenAI } from "@google/genai";

// --- Types ---
type Role = "Student" | "Mentor";
type SubscriptionTier = "Free" | "Weekly" | "Monthly" | "Yearly";

interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  dob: string;
  institution: string;
  level: string;
  role: Role;
  selectedSkills?: string[];
  onboardingCompleted: boolean;
  totalHelpsGiven?: number;
  subscription: SubscriptionTier;
  downloadCount: number;
  maxDownloads: number;
  subscriptionExpiry?: string;
}

// --- Collaboration Hub Component ---

const CollaborationHub = ({ profile, onUpdateProfile, savedProjects }: { profile: UserProfile, onUpdateProfile: (p: UserProfile) => void, savedProjects: any[] }) => {
  const [posts, setPosts] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPost, setNewPost] = useState({
    projectName: "",
    type: "Code Help" as "Code Help" | "General Feedback",
    content: "",
    codeSnippet: "",
    tags: ""
  });
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");

  // Gemini AI First Responder Logic
  useEffect(() => {
    const checkUnansweredPosts = async () => {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      const unansweredPosts = posts.filter(post => 
        post.unanswered && 
        post.timestamp?.toDate() < thirtyMinutesAgo &&
        !post.aiResponded // We'll add this flag to avoid multiple AI responses
      );

      for (const post of unansweredPosts) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
          const prompt = `You are a technical mentor for a student developer. 
          The student is stuck on a project called "${post.projectName}".
          Request Type: ${post.type}
          Description: ${post.content}
          ${post.codeSnippet ? `Code Snippet: \n${post.codeSnippet}` : ""}
          
          Provide a concise "Suggested Fix" or "Documentation Link" to help them move forward. 
          Be encouraging and technical. Keep it under 150 words.`;

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ parts: [{ text: prompt }] }]
          });

          const aiSuggestion = response.text;

          if (aiSuggestion) {
            await addDoc(collection(db, `hubPosts/${post.id}/comments`), {
              authorID: "gemini-ai",
              authorName: "Gemini AI",
              content: aiSuggestion,
              timestamp: serverTimestamp(),
              isAI: true
            });

            await updateDoc(doc(db, "hubPosts", post.id), {
              aiResponded: true
            });
          }
        } catch (error) {
          console.error("Gemini AI Responder Error:", error);
        }
      }
    };

    if (posts.length > 0) {
      checkUnansweredPosts();
    }
  }, [posts]);

  useEffect(() => {
    const q = query(collection(db, "hubPosts"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPosts(postsData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedPost) {
      const q = query(collection(db, `hubPosts/${selectedPost.id}/comments`), orderBy("timestamp", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const commentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setComments(commentsData);
      });
      return () => unsubscribe();
    }
  }, [selectedPost]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "hubPosts"), {
        authorID: profile.uid,
        authorName: profile.fullName,
        projectName: newPost.projectName,
        content: newPost.content,
        codeSnippet: newPost.codeSnippet,
        type: newPost.type,
        tags: newPost.tags.split(",").map(t => t.trim()).filter(t => t),
        timestamp: serverTimestamp(),
        unanswered: true,
        aiResponded: false
      });
      setIsModalOpen(false);
      setNewPost({ projectName: "", type: "Code Help", content: "", codeSnippet: "", tags: "" });
      toast.success("Post published to the Hub!");
    } catch (error) {
      console.error("Error creating post:", error);
      toast.error("Failed to publish post");
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      await addDoc(collection(db, `hubPosts/${selectedPost.id}/comments`), {
        authorID: profile.uid,
        authorName: profile.fullName,
        content: newComment,
        timestamp: serverTimestamp(),
        isAI: false
      });

      // Update post status
      await updateDoc(doc(db, "hubPosts", selectedPost.id), {
        unanswered: false
      });

      // Award points
      const userRef = doc(db, "users", profile.uid);
      await updateDoc(userRef, {
        totalHelpsGiven: increment(1)
      });
      onUpdateProfile({ ...profile, totalHelpsGiven: (profile.totalHelpsGiven || 0) + 1 });

      setNewComment("");
      toast.success("Reply posted! You earned a Collaborator Point!");
    } catch (error) {
      console.error("Error posting reply:", error);
      toast.error("Failed to post reply");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">Collaboration Hub</h3>
          <p className="text-gray-400">Get help, give feedback, and earn collaborator points.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-600/20 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Post a Request
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Feed */}
        <div className="lg:col-span-2 space-y-6">
          {posts.map((post) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-white/5 border rounded-3xl p-6 transition-all hover:bg-white/10 ${
                selectedPost?.id === post.id ? "border-blue-500/50 ring-1 ring-blue-500/20" : "border-white/10"
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white">
                    {post.authorName?.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-white">{post.authorName}</h4>
                    <p className="text-xs text-gray-500">{post.projectName}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-3 py-1 rounded-full border uppercase tracking-wider ${
                  post.type === "Code Help" 
                    ? "bg-red-500/10 text-red-400 border-red-500/20" 
                    : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                }`}>
                  {post.type}
                </span>
              </div>

              <p className="text-gray-300 mb-4 leading-relaxed">{post.content}</p>

              {post.codeSnippet && (
                <div className="bg-black/40 rounded-xl p-4 mb-4 font-mono text-sm text-blue-300 overflow-x-auto">
                  <pre><code>{post.codeSnippet}</code></pre>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-6">
                {post.tags?.map((tag: string) => (
                  <span key={tag} className="text-[10px] font-bold bg-white/5 text-gray-400 px-2 py-1 rounded-lg border border-white/10">
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-gray-500 text-xs">
                  <span className="flex items-center gap-1">
                    <MessageCircle className="w-4 h-4" />
                    {/* We'd need a count here, but for now just static or query */}
                    Reply
                  </span>
                  {post.unanswered && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <AlertCircle className="w-4 h-4" />
                      Unanswered
                    </span>
                  )}
                </div>
                <button 
                  onClick={() => setSelectedPost(post)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-bold rounded-xl border border-white/10 transition-all"
                >
                  View Discussion
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Discussion Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 space-y-6">
            {selectedPost ? (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col h-[calc(100vh-200px)]">
                <h4 className="font-bold text-white mb-6 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  Discussion
                </h4>
                
                <div className="flex-grow overflow-y-auto space-y-6 mb-6 pr-2 custom-scrollbar">
                  {comments.map((comment) => (
                    <div key={comment.id} className={`space-y-2 p-4 rounded-2xl border ${comment.isAI ? "bg-blue-600/10 border-blue-500/20" : "bg-white/5 border-white/10"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white ${
                            comment.isAI ? "bg-purple-600" : "bg-gray-600"
                          }`}>
                            {comment.isAI ? "AI" : comment.authorName?.charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-white">{comment.isAI ? "Gemini AI" : comment.authorName}</span>
                        </div>
                        {selectedPost.authorID === profile.uid && comment.authorID !== profile.uid && !comment.isAI && !comment.isHelpful && (
                          <button 
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, `hubPosts/${selectedPost.id}/comments`, comment.id), {
                                  isHelpful: true
                                });
                                const authorRef = doc(db, "users", comment.authorID);
                                await updateDoc(authorRef, {
                                  totalHelpsGiven: increment(1)
                                });
                                toast.success("Marked as helpful! Points awarded.");
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" />
                            Mark Helpful
                          </button>
                        )}
                        {comment.isHelpful && (
                          <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Helpful
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 leading-relaxed">{comment.content}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleReply} className="mt-auto relative">
                  <input 
                    type="text" 
                    placeholder="Type your reply..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-4 pr-12 py-3 text-sm outline-none focus:border-blue-500/50 transition-all text-white"
                  />
                  <button 
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 border-dashed rounded-3xl p-12 text-center">
                <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 text-sm">Select a post to join the discussion</p>
              </div>
            )}

            {/* Stats Card */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <Award className="w-8 h-8" />
                <div>
                  <h4 className="font-bold">Collaborator Status</h4>
                  <p className="text-xs text-blue-100/60">Help others to level up</p>
                </div>
              </div>
              <div className="bg-white/10 rounded-2xl p-4 text-center">
                <p className="text-3xl font-bold mb-1">{profile.totalHelpsGiven || 0}</p>
                <p className="text-[10px] uppercase tracking-widest font-bold opacity-60">Helps Given</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#0A1F44] w-full max-w-2xl rounded-3xl p-8 border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-bold text-white">Post a Request</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleCreatePost} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Project Link</label>
                    <select 
                      required
                      value={newPost.projectName}
                      onChange={(e) => setNewPost({...newPost, projectName: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50"
                    >
                      <option value="" disabled className="bg-[#0A1F44]">Select a project</option>
                      {savedProjects.map(p => (
                        <option key={p.id} value={p.name} className="bg-[#0A1F44]">{p.name}</option>
                      ))}
                      <option value="General Coding" className="bg-[#0A1F44]">General Coding</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Request Type</label>
                    <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
                      <button
                        type="button"
                        onClick={() => setNewPost({...newPost, type: "Code Help"})}
                        className={`flex-grow py-2 rounded-lg text-xs font-bold transition-all ${
                          newPost.type === "Code Help" ? "bg-red-500 text-white" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Code Help
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPost({...newPost, type: "General Feedback"})}
                        className={`flex-grow py-2 rounded-lg text-xs font-bold transition-all ${
                          newPost.type === "General Feedback" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Feedback
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Description</label>
                  <textarea 
                    required
                    placeholder="Describe your problem or what you need feedback on..."
                    value={newPost.content}
                    onChange={(e) => setNewPost({...newPost, content: e.target.value})}
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50 resize-none"
                  />
                </div>

                {newPost.type === "Code Help" && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Code Snippet (Optional)</label>
                    <textarea 
                      placeholder="Paste your code here..."
                      value={newPost.codeSnippet}
                      onChange={(e) => setNewPost({...newPost, codeSnippet: e.target.value})}
                      rows={6}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-blue-300 font-mono outline-none focus:border-blue-500/50 resize-none"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Skills Needed (Comma separated)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Python, CSS-Grid, React"
                    value={newPost.tags}
                    onChange={(e) => setNewPost({...newPost, tags: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500/50"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-blue-600/20"
                >
                  Publish Post
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Header = ({ onAuthClick, onHomeClick, isAuthPage }: { onAuthClick: (isLogin: boolean) => void, onHomeClick: () => void, isAuthPage?: boolean }) => {
  return (
    <header className={`fixed top-0 left-0 w-full z-50 ${isAuthPage ? "" : "bg-white/70 backdrop-blur-md border-b border-gray-100/50"}`}>
      {isAuthPage && (
        <div className="absolute inset-0 flex">
          <div className="w-1/2 bg-[#0A1F44]" />
          <div className="w-1/2 bg-white" />
        </div>
      )}
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between relative z-10">
        <button onClick={onHomeClick} className={`flex items-center gap-2 hover:opacity-80 transition-opacity ${isAuthPage ? "text-white" : "text-[#0A1F44]"}`}>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Code2 className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">DevMatch</span>
        </button>
        
        <nav className="hidden md:flex items-center gap-8">
          <a href="#about" className="text-gray-600 hover:text-blue-600 font-medium transition-colors">About</a>
          <a href="#programs" className="text-gray-600 hover:text-blue-600 font-medium transition-colors">Programs</a>
          <button onClick={() => onAuthClick(true)} className="text-gray-600 hover:text-blue-600 font-medium transition-colors">Login</button>
          <button 
            onClick={() => onAuthClick(false)}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
          >
            Sign Up
          </button>
        </nav>
      </div>
    </header>
  );
};

const Footer = () => {
  return (
    <footer className="bg-[#0A1F44] text-white py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Code2 className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight">DevMatch</span>
            </div>
            <p className="text-blue-100/60 max-w-sm">
              Connecting the next generation of developers with world-class mentors and impactful open-source projects.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold mb-6">Quick Links</h4>
            <ul className="space-y-4 text-blue-100/60">
              <li><a href="#" className="hover:text-blue-400 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-blue-400 transition-colors">Terms of Service</a></li>
              <li><a href="#about" className="hover:text-blue-400 transition-colors">About Us</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold mb-6">Connect</h4>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-all">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-all">
                <Linkedin className="w-5 h-5" />
              </a>
              <a href="#" className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center hover:bg-blue-600 transition-all">
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
        
        <div className="pt-8 border-t border-white/10 text-center text-blue-100/40 text-sm">
          © 2026 DevMatch. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

const LandingPage = ({ onGetStarted }: { onGetStarted: (isLogin: boolean) => void }) => {
  return (
    <div className="pt-20">
      {/* Hero Section */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-sm font-bold mb-6">
              Now in Beta
            </span>
            <h1 className="text-6xl font-bold text-[#0A1F44] leading-tight mb-8">
              Master Your Craft Through <span className="text-blue-600">Real Projects.</span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-lg">
              DevMatch connects aspiring developers with curated open-source projects and expert mentors to accelerate their career growth.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => onGetStarted(false)}
                className="px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2"
              >
                Get Started Now
                <ArrowRight className="w-5 h-5" />
              </button>
              <button className="px-8 py-4 bg-white text-[#0A1F44] font-bold rounded-2xl border-2 border-gray-100 hover:border-blue-600 transition-all flex items-center justify-center">
                Learn More
              </button>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="relative z-10 bg-white p-4 rounded-[2.5rem] shadow-2xl border border-gray-100">
              <img 
                src="https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=2072" 
                alt="Developer Workspace" 
                className="rounded-[2rem] w-full"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-100 rounded-full blur-3xl opacity-50" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-100 rounded-full blur-3xl opacity-50" />
          </motion.div>
        </div>
      </section>

      {/* Programs Section */}
      <section id="programs" className="py-32 bg-gray-50 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold text-[#0A1F44] mb-4">Specialized Learning Tracks</h2>
            <p className="text-gray-600 max-w-2xl mx-auto text-lg">
              Our programs are designed to take you from hobbyist to professional contributor through structured, hands-on experience.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { 
                title: "Frontend Mastery", 
                icon: Monitor, 
                color: "bg-blue-500", 
                desc: "Master React, Next.js, and modern CSS. Build responsive, high-performance user interfaces for real-world applications." 
              },
              { 
                title: "Backend Architecture", 
                icon: Server, 
                color: "bg-indigo-500", 
                desc: "Deep dive into Node.js, Go, and system design. Learn to build scalable APIs and manage complex database architectures." 
              },
              { 
                title: "AI Engineering", 
                icon: Brain, 
                color: "bg-purple-500", 
                desc: "Integrate LLMs, build neural networks, and deploy machine learning models into production environments." 
              },
              { 
                title: "Data Intelligence", 
                icon: BarChart3, 
                color: "bg-emerald-500", 
                desc: "Master data pipelines, statistical analysis, and visualization. Turn raw data into actionable business insights." 
              }
            ].map((track, i) => (
              <motion.div
                key={track.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all group"
              >
                <div className={`w-16 h-16 ${track.color} rounded-2xl flex items-center justify-center text-white mb-8 group-hover:rotate-6 transition-transform`}>
                  <track.icon className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-4">{track.title}</h3>
                <p className="text-gray-500 leading-relaxed">{track.desc}</p>
                <div className="mt-8 pt-8 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">12 Weeks</span>
                  <button className="text-blue-600 font-bold text-sm hover:underline">View Syllabus</button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-32 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="order-2 lg:order-1 relative">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  className="bg-blue-600 h-64 rounded-[3rem] shadow-2xl shadow-blue-200 flex items-center justify-center p-8 text-white text-center"
                >
                  <div>
                    <p className="text-4xl font-bold mb-2">500+</p>
                    <p className="text-sm font-medium opacity-80 uppercase tracking-widest">Active Mentors</p>
                  </div>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gray-100 h-40 rounded-[2.5rem]" 
                />
              </div>
              <div className="space-y-6 pt-12">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gray-100 h-40 rounded-[2.5rem]" 
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="bg-[#0A1F44] h-64 rounded-[3rem] shadow-2xl shadow-navy-200 flex items-center justify-center p-8 text-white text-center"
                >
                  <div>
                    <p className="text-4xl font-bold mb-2">10k+</p>
                    <p className="text-sm font-medium opacity-80 uppercase tracking-widest">Commits Made</p>
                  </div>
                </motion.div>
              </div>
            </div>
            {/* Decorative background circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-blue-50 rounded-full -z-10 blur-3xl opacity-50" />
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-blue-600 font-bold uppercase tracking-widest text-sm mb-6 block">Our Vision</span>
            <h2 className="text-5xl font-bold text-[#0A1F44] mb-8 leading-tight">Bridging the Gap Between Learning and Doing</h2>
            <p className="text-gray-600 text-xl mb-10 leading-relaxed">
              DevMatch was founded on a simple premise: the best way to become a world-class developer is to build world-class software. We provide the infrastructure for meaningful mentorship and contribution.
            </p>
            <div className="space-y-8">
              {[
                { title: "Direct Mentorship", desc: "Get paired with industry veterans who provide code reviews and career guidance." },
                { title: "Real Contribution History", desc: "Build a GitHub profile that proves your skills to top-tier tech companies." },
                { title: "Global Collaborative Network", desc: "Join a community of passionate developers from over 50 countries." }
              ].map((item, i) => (
                <motion.div 
                  key={item.title}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex gap-6"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-[#0A1F44] mb-2">{item.title}</h4>
                    <p className="text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const AuthPage = ({ onAuthSuccess, initialIsLogin = true }: { onAuthSuccess: (user: UserProfile) => void, initialIsLogin?: boolean }) => {
  const [isLogin, setIsLogin] = useState(initialIsLogin);

  useEffect(() => {
    setIsLogin(initialIsLogin);
  }, [initialIsLogin]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Signup fields
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [institution, setInstitution] = useState("");
  const [level, setLevel] = useState("Level 1");

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      if (isLogin) {
        const storedUsers = JSON.parse(localStorage.getItem("devmatch_users") || "[]");
        const user = storedUsers.find((u: any) => u.email === email && u.password === password);
        
        if (user) {
          const { password: _, ...profile } = user;
          localStorage.setItem("devmatch_current_user", JSON.stringify(profile));
          onAuthSuccess(profile as UserProfile);
          toast.success("Welcome back!");
        } else {
          throw new Error("Invalid email or password");
        }
      } else {
        const storedUsers = JSON.parse(localStorage.getItem("devmatch_users") || "[]");
        if (storedUsers.some((u: any) => u.email === email)) {
          throw new Error("User already exists");
        }

        const profile: UserProfile = {
          uid: Math.random().toString(36).substr(2, 9),
          email,
          fullName,
          dob,
          institution,
          level,
          role: "Student", // Default role
          onboardingCompleted: false,
          totalHelpsGiven: 0,
          subscription: "Free",
          downloadCount: 0,
          maxDownloads: 3
        };

        const newUser = { ...profile, password };
        localStorage.setItem("devmatch_users", JSON.stringify([...storedUsers, newUser]));
        
        toast.success("Account created successfully! Please sign in.");
        setIsLogin(true); // Redirect to login page
        // Reset fields
        setFullName("");
        setDob("");
        setInstitution("");
        setLevel("Level 1");
        setEmail("");
        setPassword("");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-sans">
      {/* Left Side: Branding */}
      <div className="hidden lg:flex w-1/2 bg-[#0A1F44] p-16 flex-col justify-center relative overflow-hidden min-h-screen">
        <div className="z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-md"
          >
            <h1 className="text-6xl font-bold text-white leading-tight mb-8">
              Connect. Match. Code. <br />
              <span className="text-blue-400">Accelerate Your Career.</span>
            </h1>
            <p className="text-blue-100 text-xl opacity-80 leading-relaxed">
              The premier platform for developers to find meaningful open-source contributions and mentorship.
            </p>
          </motion.div>
        </div>

        {/* Abstract Graphic */}
        <div className="absolute bottom-0 left-0 w-full h-1/2 opacity-20">
          <svg viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <path d="M0,1000 C200,800 400,900 600,700 C800,500 1000,600 1000,400 L1000,1000 L0,1000 Z" fill="#3B82F6" />
          </svg>
        </div>

        <div className="absolute bottom-16 left-16 z-10 flex gap-8 text-blue-200 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>AI Matching</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Verified Mentors</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Open Source</span>
          </div>
        </div>
      </div>

      {/* Right Side: Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white min-h-screen">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-xl p-10 border border-gray-100"
        >
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {isLogin ? "Sign In" : "Create Account"}
            </h2>
            <p className="text-gray-500">
              {isLogin ? "Welcome back to the developer community" : "Join thousands of developers worldwide"}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div className="space-y-4">
              {!isLogin && (
                <>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Full Name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="date"
                      placeholder="Date of Birth"
                      required
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Institution"
                      required
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div className="relative">
                    <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select
                      required
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all appearance-none"
                    >
                      <option value="Level 1">Level 1</option>
                      <option value="Level 2">Level 2</option>
                      <option value="Level 3">Level 3</option>
                      <option value="Level 4">Level 4</option>
                    </select>
                  </div>
                </>
              )}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  placeholder="Email Address"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="password"
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? "Processing..." : isLogin ? "Sign In" : "Create Account"}
              {!loading && <ChevronRight className="w-5 h-5" />}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-blue-600 font-semibold hover:underline"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const OnboardingModal = ({ onComplete }: { onComplete: (skills: string[]) => void }) => {
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const skills = [
    { id: "Python", name: "Python Development", icon: Code2 },
    { id: "Web Dev", name: "Web Development", icon: Monitor },
    { id: "ML", name: "Machine Learning", icon: Brain },
    { id: "UI/UX", name: "UI/UX Design", icon: LayoutDashboard },
    { id: "Data Analysis", name: "Data Analysis", icon: BarChart3 },
    { id: "Node.js", name: "Backend (Node.js)", icon: Server },
    { id: "React", name: "Frontend (React)", icon: Code2 },
  ];

  const toggleSkill = (id: string) => {
    setSelectedSkills([id]); // Only allow one skill
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#0A1F44] w-full max-w-2xl rounded-3xl p-8 border border-white/10 shadow-2xl"
      >
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Choose Your Primary Skill</h2>
          <p className="text-blue-200/60">Select the skill you want to master. Your experience will be tailored to this choice.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
          {skills.map((skill) => {
            const Icon = skill.icon;
            const isSelected = selectedSkills.includes(skill.id);
            return (
              <button
                key={skill.id}
                onClick={() => toggleSkill(skill.id)}
                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-4 relative ${
                  isSelected 
                    ? "bg-blue-600/20 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]" 
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                <div className={`p-4 rounded-xl ${isSelected ? "bg-blue-500 text-white" : "bg-white/10 text-blue-300"}`}>
                  <Icon className="w-8 h-8" />
                </div>
                <span className={`font-semibold ${isSelected ? "text-white" : "text-blue-100/70"}`}>
                  {skill.name}
                </span>
                {isSelected && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-3 right-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-400 fill-blue-400/20" />
                  </motion.div>
                )}
              </button>
            );
          })}
        </div>

        <button
          disabled={selectedSkills.length !== 1}
          onClick={() => onComplete(selectedSkills)}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
        >
          Get Started
          <ChevronRight className="w-5 h-5" />
        </button>
      </motion.div>
    </div>
  );
};

const PremiumModal = ({ isOpen, onClose, onUpgrade }: { isOpen: boolean, onClose: () => void, onUpgrade: (tier: SubscriptionTier, price: number, limit: number) => void }) => {
  if (!isOpen) return null;

  const plans = [
    { tier: "Weekly" as SubscriptionTier, price: 100, limit: 6, period: "week", description: "Perfect for a quick sprint." },
    { tier: "Monthly" as SubscriptionTier, price: 3000, limit: 15, period: "month", description: "Best for consistent learners." },
    { tier: "Yearly" as SubscriptionTier, price: 20000, limit: 120, period: "year", description: "Ultimate value for pros." },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0A1F44] w-full max-w-4xl rounded-[3rem] p-10 border border-white/10 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-6">
          <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-all">
            <X className="w-6 h-6 text-white/60" />
          </button>
        </div>

        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-white mb-4">Upgrade to Premium</h2>
          <p className="text-blue-200/60 max-w-xl mx-auto">You've reached your free limit. Choose a plan to unlock more project downloads and accelerate your learning.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div key={plan.tier} className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col hover:border-blue-500/50 transition-all group">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{plan.tier}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{plan.description}</p>
              </div>
              <div className="mb-8">
                <p className="text-4xl font-bold text-white">₦{plan.price.toLocaleString()}</p>
                <p className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1">per {plan.period}</p>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                <li className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  {plan.limit} Project Downloads
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Priority AI Support
                </li>
                <li className="flex items-center gap-3 text-sm text-gray-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Premium Roadmap Steps
                </li>
              </ul>
              <button 
                onClick={() => onUpgrade(plan.tier, plan.price, plan.limit)}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-600/20 group-hover:scale-105"
              >
                Choose {plan.tier}
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

const Dashboard = ({ profile, onLogout, onUpdateProfile }: { profile: UserProfile, onLogout: () => void, onUpdateProfile: (p: UserProfile) => void }) => {
  const [matchedProjects, setMatchedProjects] = useState<any[]>([]);
  const [matching, setMatching] = useState(false);
  const [skillGap, setSkillGap] = useState<{ skill: string, reason: string } | null>(null);
  const [activeTab, setActiveTab] = useState("Home");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<any[]>([]);
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [roadmap, setRoadmap] = useState<{ steps: { title: string, description: string }[] } | null>(null);
  const [peerMatch, setPeerMatch] = useState<{ name: string, skill: string, reason: string } | null>(null);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  
  // Premium State
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  
  // Home Tab State
  const [homeTab, setHomeTab] = useState<"Local" | "Global">("Global");
  const [skillFilter, setSkillFilter] = useState<string | null>(profile.selectedSkills?.[0] || null);
  
  // Dashboard Tab State
  const [rankingData, setRankingData] = useState<{ recommendation: string, rankedIds: string[] } | null>(null);
  const [ranking, setRanking] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    // Load saved and active projects from localStorage
    const storedSaved = localStorage.getItem(`saved_projects_${profile.email}`);
    if (storedSaved) setSavedProjects(JSON.parse(storedSaved));
    
    const storedActive = localStorage.getItem(`active_projects_${profile.email}`);
    if (storedActive) setActiveProjects(JSON.parse(storedActive));

    if (profile.role === "Student" && profile.onboardingCompleted) {
      handleSkillGap();
      handlePeerMatch();
    }
  }, [profile.onboardingCompleted]);

  useEffect(() => {
    if (activeTab === "Dashboard" && savedProjects.length > 0 && !rankingData) {
      handleRanking();
    }
    if (activeTab === "Skill Roadmap" && !roadmap) {
      handleRoadmap();
    }
  }, [activeTab]);

  const handleRanking = async () => {
    setRanking(true);
    try {
      const data = await rankSavedProjects({ level: profile.level }, savedProjects);
      setRankingData(data);
    } catch (error) {
      console.error("Ranking error:", error);
    } finally {
      setRanking(false);
    }
  };

  const handleMatch = async () => {
    setMatching(true);
    try {
      const projects = await matchProjects({
        skills: profile.selectedSkills || [],
        level: profile.level || "Level 1"
      });
      setMatchedProjects(projects);
    } catch (error) {
      toast.error("Failed to match projects");
    } finally {
      setMatching(false);
    }
  };

  const handleSkillGap = async () => {
    try {
      const analysis = await getSkillGapAnalysis(profile.selectedSkills || []);
      setSkillGap(analysis);
    } catch (error) {
      console.error("Skill gap error:", error);
    }
  };

  const handleRoadmap = async () => {
    setLoadingRoadmap(true);
    try {
      const data = await getSkillRoadmap({
        skills: profile.selectedSkills || [],
        level: profile.level || "Level 1"
      });
      setRoadmap(data);
    } catch (error) {
      console.error("Roadmap error:", error);
    } finally {
      setLoadingRoadmap(false);
    }
  };

  const handlePeerMatch = async () => {
    try {
      const data = await getPeerMatch({
        skills: profile.selectedSkills || [],
        level: profile.level || "Level 1"
      });
      setPeerMatch(data);
    } catch (error) {
      console.error("Peer match error:", error);
    }
  };

  const handleUpgrade = (tier: SubscriptionTier, price: number, limit: number) => {
    const updatedProfile = {
      ...profile,
      subscription: tier,
      maxDownloads: limit,
      downloadCount: 0, // Reset for new subscription
      subscriptionExpiry: new Date(Date.now() + (tier === "Weekly" ? 7 : tier === "Monthly" ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString()
    };
    onUpdateProfile(updatedProfile);
    setIsPremiumModalOpen(false);
    toast.success(`Successfully upgraded to ${tier} plan!`);
  };

  const downloadProject = async (project: any) => {
    if (profile.downloadCount >= profile.maxDownloads) {
      setIsPremiumModalOpen(true);
      return;
    }

    try {
      toast.loading("Preparing download...", { id: "download" });
      
      // Construct GitHub ZIP URL
      // Format: https://github.com/owner/repo/archive/refs/heads/main.zip
      // We assume the githubUrl is valid and points to a repo
      const zipUrl = `${project.githubUrl}/archive/refs/heads/main.zip`;
      
      // Trigger download
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = `${project.name}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Update download count
      const updatedProfile = {
        ...profile,
        downloadCount: profile.downloadCount + 1
      };
      onUpdateProfile(updatedProfile);
      
      toast.success(`Started download for ${project.name}`, { id: "download" });
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to start download. Please try the GitHub link directly.", { id: "download" });
    }
  };

  const saveProject = async (project: any) => {
    if (savedProjects.some(p => p.id === project.id)) {
      toast.info("Project already in your learning path");
      return;
    }

    if (profile.subscription === "Free" && savedProjects.length >= 3) {
      setIsPremiumModalOpen(true);
      return;
    }
    
    const projectToSave = { ...project, savedAt: new Date().toISOString() };
    const updated = [...savedProjects, projectToSave];
    setSavedProjects(updated);
    localStorage.setItem(`saved_projects_${profile.email}`, JSON.stringify(updated));

    // Try to save to Firestore if user is logged in
    if (auth.currentUser) {
      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
          savedProjects: arrayUnion(projectToSave)
        });
        toast.success("Project saved to your Firestore profile!");
      } catch (error) {
        console.error("Firestore save error:", error);
        toast.success("Project saved locally!");
      }
    } else {
      toast.success("Project saved locally!");
    }
    
    setRankingData(null);
  };

  const removeProject = async (projectId: string) => {
    const projectToRemove = savedProjects.find(p => p.id === projectId);
    if (!projectToRemove) return;

    const updated = savedProjects.filter(p => p.id !== projectId);
    setSavedProjects(updated);
    localStorage.setItem(`saved_projects_${profile.email}`, JSON.stringify(updated));

    if (auth.currentUser) {
      try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
          savedProjects: arrayRemove(projectToRemove)
        });
        toast.info("Removed from learning path");
      } catch (error) {
        console.error("Firestore remove error:", error);
        toast.info("Removed locally");
      }
    } else {
      toast.info("Removed locally");
    }
  };

  const contributeToProject = (project: any) => {
    if (activeProjects.some(p => p.id === project.id)) {
      toast.info("You are already contributing to this project");
      return;
    }
    const updated = [...activeProjects, { ...project, status: "In Progress", joinedAt: new Date().toISOString() }];
    setActiveProjects(updated);
    localStorage.setItem(`active_projects_${profile.email}`, JSON.stringify(updated));
    toast.success("Joined project! Track it in My Projects.");
  };

  const handleLevelUp = () => {
    const levels = ["Level 1", "Level 2", "Level 3", "Level 4"];
    const currentIndex = levels.indexOf(profile.level || "Level 1");
    if (currentIndex < levels.length - 1) {
      const nextLevel = levels[currentIndex + 1];
      const updated = { ...profile, level: nextLevel };
      onUpdateProfile(updated);
      toast.success(`Leveled up to ${nextLevel}!`);
      handleMatch(); // Refresh matches for new level
    } else {
      toast.info("You've reached the maximum level!");
    }
  };

  const SidebarItem = ({ icon: Icon, label }: { icon: any, label: string }) => (
    <button
      onClick={() => {
        setActiveTab(label);
        setIsSidebarOpen(false);
      }}
      className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all duration-300 group relative ${
        activeTab === label 
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-[1.02]" 
          : "text-gray-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {activeTab === label && (
        <motion.div 
          layoutId="sidebar-active"
          className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl -z-10"
        />
      )}
      <Icon className={`w-5 h-5 transition-transform duration-300 ${activeTab === label ? "scale-110" : "group-hover:scale-110"}`} />
      <span className={`font-bold tracking-wide ${activeTab === label ? "text-white" : "group-hover:text-white"}`}>{label}</span>
      {activeTab === label && (
        <div className="absolute right-4 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_#fff]" />
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0A1128] text-white flex relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-72 border-r border-white/10 p-6 flex flex-col bg-[#0A1128]/80 backdrop-blur-xl z-50 transition-transform duration-300
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="flex items-center justify-between mb-10 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200">DevMatch</h1>
          </div>
          <button className="lg:hidden text-white/60 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="space-y-2 flex-grow">
          <SidebarItem icon={HomeIcon} label="Home" />
          <SidebarItem icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem icon={Map} label="Skill Roadmap" />
          <SidebarItem icon={Settings} label="Profile Settings" />
        </nav>

        {/* Team Up Widget */}
        <div className="mt-6 p-5 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-blue-500/20 transition-all" />
          <div className="flex items-center gap-2 mb-3 text-blue-400">
            <UserPlus className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Team Up</span>
          </div>
          {peerMatch ? (
            <div className="space-y-2 relative z-10">
              <p className="text-sm font-bold text-white">{peerMatch.name}</p>
              <p className="text-[10px] text-blue-300/80 uppercase tracking-widest font-medium">{peerMatch.skill}</p>
              <p className="text-[10px] text-blue-100/60 leading-tight">{peerMatch.reason}</p>
              <button className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-all shadow-lg shadow-blue-600/20">
                Connect Now
              </button>
            </div>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-white/10 rounded w-1/2" />
              <div className="h-3 bg-white/10 rounded w-3/4" />
            </div>
          )}
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
          >
            <Lock className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col h-screen overflow-hidden relative">
        {/* Background Glows */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Header */}
        <header className="h-20 border-b border-white/10 px-8 flex items-center justify-between bg-[#0A1128]/40 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 -ml-2 text-white/60 hover:text-white" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">{activeTab}</h2>
            <div className="h-6 w-px bg-white/10 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full shadow-lg shadow-blue-500/5">
              <TrendingUp className="w-3 h-3 text-blue-400" />
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">{profile.level}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full shadow-lg shadow-emerald-500/5">
              <Github className="w-3 h-3 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">GitHub Linked</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex items-center gap-3 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-2xl">
              <div className="text-right">
                <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Plan</p>
                <p className="text-sm font-bold text-white">{profile.subscription}</p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-left">
                <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Downloads</p>
                <p className="text-sm font-bold text-white">{profile.downloadCount} / {profile.maxDownloads}</p>
              </div>
            </div>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search projects..." 
                className="bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all w-64 text-white placeholder:text-gray-500"
              />
            </div>
            <button className="relative p-2 text-gray-400 hover:text-white transition-colors group">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#0A1128] group-hover:scale-125 transition-transform" />
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-white">{profile.fullName}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">{profile.role}</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-xl shadow-blue-600/20 border border-white/10">
                {profile.fullName.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-grow overflow-y-auto p-8 custom-scrollbar relative z-10">
          <div className="max-w-7xl mx-auto space-y-8">
            
            {activeTab === "Home" && (
              <div className="space-y-8">
                <PremiumModal 
                  isOpen={isPremiumModalOpen} 
                  onClose={() => setIsPremiumModalOpen(false)} 
                  onUpgrade={handleUpgrade}
                />
                
                {/* Discovery Hub Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">Discovery Hub</h3>
                    <p className="text-gray-400">Explore projects tailored to your <span className="text-blue-400 font-bold">{profile.selectedSkills?.[0]}</span> expertise.</p>
                  </div>
                  
                  {/* Glassmorphism Tabs */}
                  <div className="flex p-1.5 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl">
                    <button
                      onClick={() => {
                        setLoadingProjects(true);
                        setHomeTab("Local");
                        setTimeout(() => setLoadingProjects(false), 600);
                      }}
                      className={`px-8 py-2.5 rounded-xl font-bold transition-all duration-300 ${
                        homeTab === "Local" ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]" : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Local Projects
                    </button>
                    <button
                      onClick={() => {
                        setLoadingProjects(true);
                        setHomeTab("Global");
                        setTimeout(() => setLoadingProjects(false), 600);
                      }}
                      className={`px-8 py-2.5 rounded-xl font-bold transition-all duration-300 ${
                        homeTab === "Global" ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]" : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Global Projects
                    </button>
                  </div>
                </div>

                {/* Skill Filters */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-blue-400/80 mb-2">
                    <Filter className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Explore by Skill</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                    {["Python", "Web Dev", "ML", "UI/UX", "Data Analysis", "Node.js", "React"].map(skill => (
                      <button
                        key={skill}
                        onClick={() => {
                          if (skillFilter !== skill) {
                            setLoadingProjects(true);
                            setSkillFilter(skill);
                            setTimeout(() => setLoadingProjects(false), 400);
                          } else {
                            setSkillFilter(null);
                          }
                        }}
                        className={`px-6 py-2.5 rounded-full border font-bold whitespace-nowrap transition-all duration-300 ${
                          skillFilter === skill 
                            ? "bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] scale-105" 
                            : "bg-white/5 border-white/10 text-gray-400 hover:border-blue-500/30 hover:text-blue-100 hover:bg-white/10"
                        }`}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Project Feed */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 min-h-[400px] relative">
                  <AnimatePresence mode="wait">
                    {loadingProjects ? (
                      <motion.div 
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center z-20"
                      >
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                          <p className="text-blue-400 font-bold animate-pulse">Finding Projects...</p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="grid"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="contents"
                      >
                        {projectsData
                          .filter(p => p.type === homeTab.toLowerCase())
                          .filter(p => !skillFilter || p.tags.includes(skillFilter))
                          .slice(0, 5)
                          .map((project, i) => (
                            <motion.div
                              key={project.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="bg-gradient-to-br from-white/10 to-white/[0.02] border border-white/10 rounded-[2rem] p-7 hover:border-blue-500/40 hover:bg-white/[0.08] transition-all duration-500 group flex flex-col shadow-xl hover:shadow-blue-500/5"
                            >
                              <div className="mb-6 flex-grow">
                                <div className="flex justify-between items-start mb-4">
                                  <h4 className="text-xl font-bold group-hover:text-blue-400 transition-colors leading-tight">{project.name}</h4>
                                  <div className="flex flex-col items-end gap-2">
                                    <span className="text-[10px] font-bold px-3 py-1 bg-blue-500/10 text-blue-300 rounded-full border border-blue-500/20 uppercase tracking-wider">
                                      {project.difficulty}
                                    </span>
                                    <div className="flex gap-2">
                                      {project.stars && (
                                        <div className="flex items-center gap-1 text-[10px] text-yellow-500/80 font-bold bg-yellow-500/10 px-2 py-0.5 rounded-md border border-yellow-500/20">
                                          <Star className="w-3 h-3 fill-yellow-500" />
                                          {project.stars.toLocaleString()}
                                        </div>
                                      )}
                                      {project.issues !== undefined && (
                                        <div className="flex items-center gap-1 text-[10px] text-red-500/80 font-bold bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                                          <AlertCircle className="w-3 h-3" />
                                          {project.issues} Issues
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <p className="text-gray-400 text-sm line-clamp-3 leading-relaxed mb-6">
                                  {project.description}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {project.tags.map(t => (
                                    <span key={t} className={`text-[10px] font-bold px-3 py-1 rounded-lg border ${
                                      profile.selectedSkills?.includes(t) 
                                        ? "bg-blue-500/20 text-blue-300 border-blue-500/30" 
                                        : "bg-indigo-500/10 text-indigo-300 border-indigo-500/10"
                                    }`}>
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="flex gap-3 mt-auto">
                                <button 
                                  onClick={() => downloadProject(project)}
                                  className="flex-grow py-3.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white font-bold rounded-2xl border border-emerald-500/20 hover:border-emerald-500 transition-all duration-300 flex items-center justify-center gap-2 shadow-lg"
                                >
                                  <Save className="w-5 h-5" />
                                  Download ZIP
                                </button>
                                <button 
                                  onClick={() => saveProject(project)}
                                  className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                                    savedProjects.some(p => p.id === project.id)
                                      ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/20"
                                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white"
                                  }`}
                                  title="Save to Dashboard"
                                >
                                  <Bookmark className="w-5 h-5" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
            

            
            {activeTab === "Dashboard" && (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-100">Learning Path</h3>
                    <p className="text-gray-400">Track your progress and study real-world repositories.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-3 rounded-2xl text-white shadow-xl flex items-center gap-3">
                      <Award className="w-5 h-5" />
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold opacity-60">Collaborator Points</p>
                        <p className="text-xl font-bold">{profile.totalHelpsGiven || 0}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {savedProjects.length === 0 ? (
                  <div className="py-24 text-center bg-white/5 border border-dashed border-white/10 rounded-[3rem] relative overflow-hidden group">
                    <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                      <Bookmark className="w-10 h-10 text-blue-400" />
                    </div>
                    <h4 className="text-2xl font-bold mb-4 text-white">Find your first project</h4>
                    <p className="text-gray-400 max-w-md mx-auto mb-10 leading-relaxed">
                      Your learning path is empty. Head over to the Discovery Hub to explore and save projects that match your interests.
                    </p>
                    <button 
                       onClick={() => setActiveTab("Home")}
                       className="px-10 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 transition-all shadow-2xl shadow-blue-600/30 flex items-center justify-center gap-2 mx-auto scale-105 hover:scale-110 active:scale-95"
                    >
                      Explore Projects
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {savedProjects.map((project, index) => (
                      <motion.div
                        key={project.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6 group hover:bg-white/[0.08] transition-all"
                      >
                        <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-blue-500/20">
                          <span className="text-2xl font-bold text-blue-400">{index + 1}</span>
                        </div>
                        <div className="flex-grow text-center md:text-left">
                          <h4 className="text-xl font-bold text-white mb-1">{project.name}</h4>
                          <p className="text-gray-400 text-sm mb-3 leading-relaxed">{project.description}</p>
                          <div className="flex flex-wrap justify-center md:justify-start gap-2">
                            {project.tags.map((t: string) => (
                              <span key={t} className="text-[10px] font-bold bg-white/5 text-blue-300 px-2 py-1 rounded-md border border-white/10">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <a 
                            href={project.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                          >
                            <Github className="w-4 h-4" />
                            View Repo
                          </a>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => removeProject(project.id)}
                                    className="p-3 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-xl border border-white/10 transition-all"
                                    title="Remove from path"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                  <button 
                                    onClick={() => downloadProject(project)}
                                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                                  >
                                    <Save className="w-4 h-4" /> Download ZIP
                                  </button>
                                </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Skill Progress */}
                  <div className="lg:col-span-2 bg-gradient-to-br from-white/10 to-white/[0.02] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
                    <div className="flex items-center justify-between mb-10">
                      <h3 className="text-xl font-bold flex items-center gap-3">
                        <Activity className="text-blue-500 w-6 h-6" />
                        Skill Progress
                      </h3>
                      <span className="text-xs text-gray-500 font-medium bg-white/5 px-3 py-1 rounded-full">Updated 2h ago</span>
                    </div>

                    <div className="space-y-10">
                      {profile.selectedSkills?.map((skillId) => {
                        const skillName = skillId.replace('-', ' ');
                        return (
                          <div key={skillId} className="group">
                            <div className="flex justify-between items-center mb-4">
                              <span className="text-sm font-bold capitalize text-white group-hover:text-blue-400 transition-colors">{skillName}</span>
                              <span className="text-sm text-blue-400 font-mono font-bold">65%</span>
                            </div>
                            <div className="h-3.5 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: "65%" }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                                className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400 rounded-full relative shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                              >
                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[shimmer_2s_linear_infinite]" />
                              </motion.div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Skill Gap Analysis */}
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 shadow-xl shadow-blue-900/20 relative overflow-hidden group">
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 mb-6">
                        <Brain className="w-6 h-6 text-blue-100" />
                        <h3 className="font-bold text-lg">Next Best Skill</h3>
                      </div>
                      {skillGap ? (
                        <>
                          <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 mb-4 border border-white/10">
                            <p className="text-2xl font-bold text-white mb-1">{skillGap.skill}</p>
                            <div className="flex items-center gap-1 text-blue-100 text-[10px] font-bold uppercase tracking-wider">
                              <TrendingUp className="w-3 h-3" />
                              High Demand in Nigeria
                            </div>
                          </div>
                          <p className="text-sm text-blue-100 leading-relaxed opacity-90">
                            {skillGap.reason}
                          </p>
                        </>
                      ) : (
                        <div className="animate-pulse space-y-4">
                          <div className="h-20 bg-white/10 rounded-2xl" />
                          <div className="h-10 bg-white/10 rounded-2xl" />
                        </div>
                      )}
                      <button 
                        onClick={() => setActiveTab("Skill Roadmap")}
                        className="w-full mt-6 py-3 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                      >
                        View Roadmap
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}




            {activeTab === "Skill Roadmap" && (
              <div className="max-w-3xl mx-auto space-y-12">
                <div className="text-center">
                  <h3 className="text-3xl font-bold mb-2">The Career Path</h3>
                  <p className="text-gray-500">A personalized 4-step roadmap generated by Gemini AI.</p>
                </div>

                <div className="relative">
                  {/* Vertical Line */}
                  <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-blue-600 via-indigo-500 to-transparent" />

                  <div className="space-y-12">
                    {loadingRoadmap ? (
                      Array(4).fill(0).map((_, i) => (
                        <div key={i} className="flex gap-8 animate-pulse">
                          <div className="w-16 h-16 bg-white/5 rounded-full z-10" />
                          <div className="flex-grow space-y-2">
                            <div className="h-6 bg-white/5 rounded w-1/3" />
                            <div className="h-4 bg-white/5 rounded w-full" />
                          </div>
                        </div>
                      ))
                    ) : roadmap?.steps.map((step, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.2 }}
                        className="flex gap-8 group"
                      >
                        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center font-bold text-xl shadow-lg shadow-blue-900/40 z-10 group-hover:scale-110 transition-transform">
                          {i + 1}
                        </div>
                        <div className="flex-grow pt-2">
                          <h4 className="text-xl font-bold mb-2 group-hover:text-blue-400 transition-colors">{step.title}</h4>
                          <p className="text-gray-400 leading-relaxed">{step.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <Brain className="w-6 h-6 text-blue-400" />
                    <h4 className="text-lg font-bold">Skill Gap Identified</h4>
                  </div>
                  <p className="text-gray-400 mb-6">
                    Based on your interest in <span className="text-white font-bold">Machine Learning</span>, we recommend focusing on:
                  </p>
                  <div className="p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl">
                    <p className="text-blue-400 font-bold mb-1">FastAPI for Model Deployment</p>
                    <p className="text-xs text-blue-200/70">Essential for turning your ML models into production-ready APIs.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "Profile Settings" && (
              <div className="max-w-2xl mx-auto space-y-8">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                  <h3 className="text-xl font-bold mb-6">Account Info</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Full Name</label>
                      <input 
                        type="text" 
                        defaultValue={profile.fullName}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Institution</label>
                      <input 
                        type="text" 
                        defaultValue={profile.institution}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Date of Birth</label>
                      <input 
                        type="date" 
                        defaultValue={profile.dob}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-bold block mb-2">Email Address</label>
                      <input 
                        type="email" 
                        defaultValue={profile.email}
                        disabled
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 opacity-50 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                  <h3 className="text-xl font-bold mb-6">Technical Identity</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-bold block mb-2">GitHub URL</label>
                      <div className="relative">
                        <Github className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input 
                          type="text" 
                          placeholder="https://github.com/username"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl">
                      <div>
                        <p className="text-sm font-bold">Current Level: {profile.level}</p>
                        <p className="text-xs text-blue-200/70">Progress to next level: 75%</p>
                      </div>
                      <button 
                        onClick={handleLevelUp}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20"
                      >
                        Level Up
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <Award className="w-6 h-6 text-emerald-400" />
                        <div>
                          <p className="text-sm font-bold text-white">Collaborator Points: {profile.totalHelpsGiven || 0}</p>
                          <p className="text-xs text-emerald-200/70">Total Helps Given to the community</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
                  <h3 className="text-xl font-bold mb-6">Expertise Tags</h3>
                  <div className="flex flex-wrap gap-3">
                    {profile.selectedSkills?.map(skill => (
                      <span key={skill} className="px-4 py-2 bg-blue-600/10 text-blue-400 font-bold rounded-xl border border-blue-500/20 capitalize">
                        {skill.replace('-', ' ')}
                      </span>
                    ))}
                    <button className="px-4 py-2 bg-white/5 text-gray-400 font-bold rounded-xl border border-dashed border-white/10 hover:border-blue-500/50 hover:text-white transition-all flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add Skill
                    </button>
                  </div>
                </div>

                <button className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-900/20 transition-all">
                  Save Changes
                </button>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<'home' | 'auth'>('home');
  const [isLoginMode, setIsLoginMode] = useState(true);

  useEffect(() => {
    // Mock Auth Check: Check localStorage for current user
    const storedUser = localStorage.getItem("devmatch_current_user");
    if (storedUser) {
      setUserProfile(JSON.parse(storedUser));
    }
    setAuthReady(true);
  }, []);

  const handleAuthClick = (isLogin: boolean) => {
    setIsLoginMode(isLogin);
    setView('auth');
    window.scrollTo(0, 0);
  };

  const handleHomeClick = () => {
    setView('home');
    window.scrollTo(0, 0);
  };

  const handleLogout = () => {
    localStorage.removeItem("devmatch_current_user");
    setUserProfile(null);
    setView('home');
    toast.info("Logged out successfully");
  };

  const handleOnboardingComplete = (skills: string[]) => {
    if (!userProfile) return;
    
    const updatedProfile: UserProfile = {
      ...userProfile,
      selectedSkills: skills,
      onboardingCompleted: true,
      subscription: "Free",
      downloadCount: 0,
      maxDownloads: 3
    };

    // Update in localStorage
    const storedUsers = JSON.parse(localStorage.getItem("devmatch_users") || "[]");
    const updatedUsers = storedUsers.map((u: any) => 
      u.email === userProfile.email ? { ...u, ...updatedProfile } : u
    );
    
    localStorage.setItem("devmatch_users", JSON.stringify(updatedUsers));
    localStorage.setItem("devmatch_current_user", JSON.stringify(updatedProfile));
    
    setUserProfile(updatedProfile);
    toast.success(`Welcome to DevMatch! Your experience is now tailored to ${skills[0]}.`);
  };

  const handleUpdateProfile = (updated: UserProfile) => {
    // Update in localStorage
    const storedUsers = JSON.parse(localStorage.getItem("devmatch_users") || "[]");
    const updatedUsers = storedUsers.map((u: any) => 
      u.email === userProfile?.email ? { ...u, ...updated } : u
    );
    
    localStorage.setItem("devmatch_users", JSON.stringify(updatedUsers));
    localStorage.setItem("devmatch_current_user", JSON.stringify(updated));
    
    setUserProfile(updated);
  };

  if (!authReady) return null;

  return (
    <div className="flex flex-col min-h-screen">
      <Toaster position="top-center" richColors />
      
      {!userProfile && (
        <Header 
          onAuthClick={handleAuthClick} 
          onHomeClick={handleHomeClick} 
          isAuthPage={view === 'auth'}
        />
      )}

      <main className="flex-grow">
        {userProfile ? (
          <>
            {!userProfile.onboardingCompleted && (
              <OnboardingModal onComplete={handleOnboardingComplete} />
            )}
            <Dashboard 
              profile={userProfile} 
              onLogout={handleLogout} 
              onUpdateProfile={handleUpdateProfile}
            />
          </>
        ) : (
          <>
            {view === 'home' ? (
              <LandingPage onGetStarted={handleAuthClick} />
            ) : (
              <AuthPage 
                onAuthSuccess={setUserProfile} 
                initialIsLogin={isLoginMode} 
              />
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
