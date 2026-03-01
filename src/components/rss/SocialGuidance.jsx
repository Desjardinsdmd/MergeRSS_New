import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SocialGuidance({ error, guidance, platform }) {
    return (
        <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-5">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <p className="font-semibold text-amber-900 text-sm">
                            {platform} requires authenticated API access
                        </p>
                        <p className="text-sm text-amber-800 leading-relaxed">{guidance}</p>
                        {platform === 'YouTube' && (
                            <Button variant="outline" size="sm" className="mt-2 border-amber-300 text-amber-800 hover:bg-amber-100"
                                onClick={() => window.open('https://studio.youtube.com', '_blank')}>
                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                Open YouTube Studio
                            </Button>
                        )}
                        {(platform === 'Twitter/X') && (
                            <Button variant="outline" size="sm" className="mt-2 border-amber-300 text-amber-800 hover:bg-amber-100"
                                onClick={() => window.open('https://developer.twitter.com', '_blank')}>
                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                Twitter Developer Portal
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}