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
            <AlertCircle className="h-5 w-5 text-[hsl(var(--primary))]" aria-hidden="true" />
            Report a problem
          </DialogTitle>
          <DialogDescription>
            Help us improve by reporting any issues you encounter
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="report-title" className="micro-label mb-1.5">
              Issue title
            </label>
            <Input
              id="report-title"
              placeholder="e.g., Sources not updating"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="report-description" className="micro-label mb-1.5">
              Description
            </label>
            <Textarea
              id="report-description"
              placeholder="Describe what happened and what you expected..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              className="resize-none"
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
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Submit report
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}