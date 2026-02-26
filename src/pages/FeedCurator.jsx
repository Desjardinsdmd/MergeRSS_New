import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Send, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function FeedCurator() {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    initConversation();
  }, []);

  useEffect(() => {
    if (!conversation) return;

    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });

    return () => unsubscribe();
  }, [conversation?.id]);

  const initConversation = async () => {
    try {
      const conv = await base44.agents.createConversation({
        agent_name: 'feed_curator',
        metadata: {
          name: 'Feed Curation Session',
          description: 'AI-powered RSS feed discovery and merging'
        }
      });
      setConversation(conv);
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
    setInitializing(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !conversation || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: userMessage
      });
    } catch (e) {
      console.error('Failed to send message:', e);
    }
    
    setLoading(false);
  };

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-[#171a20]" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-[#171a20] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#171a20] tracking-tight">AI Feed Curator</h1>
        </div>
        <p className="text-slate-600 font-light">
          Describe what you want, and I'll find and merge the perfect RSS feeds for you
        </p>
      </div>

      <Card className="border-slate-200 mb-6">
        <CardContent className="p-0">
          <ScrollArea className="h-[500px] p-6">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-4 font-light">
                  Tell me what kind of content you're looking for
                </p>
                <div className="space-y-2 max-w-md mx-auto">
                  <button
                    onClick={() => setInput('I want a feed for Canadian CRE only specific to multifamily rentals')}
                    className="block w-full text-left p-3 border border-slate-200 hover:bg-slate-50 transition text-sm"
                  >
                    "I want Canadian CRE multifamily rental feeds"
                  </button>
                  <button
                    onClick={() => setInput('Find me AI startup news and funding announcements')}
                    className="block w-full text-left p-3 border border-slate-200 hover:bg-slate-50 transition text-sm"
                  >
                    "Find me AI startup news and funding announcements"
                  </button>
                  <button
                    onClick={() => setInput('Get me crypto market analysis and Bitcoin news')}
                    className="block w-full text-left p-3 border border-slate-200 hover:bg-slate-50 transition text-sm"
                  >
                    "Get me crypto market analysis and Bitcoin news"
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 bg-[#171a20] flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    
                    <div className={`max-w-[80%] ${message.role === 'user' ? 'flex flex-col items-end' : ''}`}>
                      {message.content && (
                        <div
                          className={`px-4 py-3 ${
                            message.role === 'user'
                              ? 'bg-[#171a20] text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                      )}
                      
                      {message.tool_calls?.map((tool, toolIdx) => (
                        <div key={toolIdx} className="mt-2 text-xs">
                          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200">
                            <Loader2 className={`w-3 h-3 ${tool.status === 'completed' ? 'text-green-600' : 'animate-spin text-slate-500'}`} />
                            <span className="text-slate-700">
                              {tool.name?.split('.').pop() || 'Processing'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {message.role === 'user' && (
                      <div className="w-8 h-8 bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
                        <User className="w-4 h-4 text-slate-600" />
                      </div>
                    )}
                  </div>
                ))}
                
                {loading && messages[messages.length - 1]?.role === 'user' && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-[#171a20] flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="px-4 py-3 bg-slate-100">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Describe what feeds you're looking for..."
          className="resize-none"
          rows={3}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="bg-[#171a20] hover:bg-black rounded-sm h-auto px-6"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}