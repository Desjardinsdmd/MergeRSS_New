import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function ReportProblemDialog({ open, onOpenChange, user }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentPage = window.location.pathname.split('/').pop() || 'unknown';
      const browserInfo = `${navigator.userAgent.substring(0, 100)}`;

      await base44.entities.ProblemReport.create({
        title: title.trim(),
        description: description.trim(),
        page: currentPage,
        user_email: user?.email,
        browser_info: browserInfo,
        status: 'open',
      });

      toast.success("Thank you for reporting! We'll look into it.");
      setTitle('');
      setDescription('');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to submit report: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400" />
            Report a Problem
          </DialogTitle>
          <DialogDescription>
            Help us improve by reporting any issues you encounter
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-200 mb-1.5">
              Issue Title
            </label>
            <Input
              placeholder="e.g., Feeds not updating"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
              className="bg-stone-800 border-stone-700 text-stone-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-200 mb-1.5">
              Description
            </label>
            <Textarea
              placeholder="Describe what happened and what you expected..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              className="bg-stone-800 border-stone-700 text-stone-100 resize-none"
            />
          </div>

          <div className="pt-2 flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-400 hover:bg-amber-500 text-stone-900 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Submit Report
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}