import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { 
  Inbox as InboxIcon, 
  Loader2, 
  Calendar,
  ExternalLink,
  ChevronRight,
  FileText,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export default function Inbox() {
  const [selectedDelivery, setSelectedDelivery] = useState(null);

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['deliveries', 'web'],
    queryFn: async () => {
      const all = await base44.entities.DigestDelivery.list('-created_date');
      return all.filter(d => d.delivery_type === 'web' && d.status === 'sent');
    },
  });

  const { data: digests = [] } = useQuery({
    queryKey: ['digests'],
    queryFn: () => base44.entities.Digest.list(),
  });

  const getDigestName = (digestId) => {
    const digest = digests.find(d => d.id === digestId);
    return digest?.name || 'Unknown Digest';
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
        <p className="text-slate-600">
          View your delivered digests
        </p>
      </div>

      {/* Delivery List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
        </div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <InboxIcon className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">No digests yet</h3>
          <p className="text-slate-500">
            Your delivered digests will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {deliveries.map((delivery) => (
            <Card 
              key={delivery.id}
              className="border-slate-100 hover:shadow-md transition cursor-pointer"
              onClick={() => setSelectedDelivery(delivery)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-violet-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">
                      {getDigestName(delivery.digest_id)}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {delivery.sent_at && format(new Date(delivery.sent_at), 'MMM d, yyyy h:mm a')}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {delivery.item_count || 0} items
                      </Badge>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delivery Detail Dialog */}
      <Dialog open={!!selectedDelivery} onOpenChange={() => setSelectedDelivery(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-600" />
              {selectedDelivery && getDigestName(selectedDelivery.digest_id)}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDelivery && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-slate-500 pb-4 border-b">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(selectedDelivery.sent_at), 'MMMM d, yyyy h:mm a')}
                </span>
                <Badge variant="secondary">
                  {selectedDelivery.item_count || 0} items
                </Badge>
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Delivered
                </Badge>
              </div>

              {selectedDelivery.date_range_start && selectedDelivery.date_range_end && (
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <p className="text-slate-600">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Coverage: {format(new Date(selectedDelivery.date_range_start), 'MMM d')} - {format(new Date(selectedDelivery.date_range_end), 'MMM d, yyyy')}
                  </p>
                </div>
              )}

              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-slate-700">
                  {selectedDelivery.content || 'No content available for this digest.'}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}