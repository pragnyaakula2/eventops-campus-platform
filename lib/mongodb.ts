/**
 * EventOps MongoDB Client and Aggregation Pipeline Service
 * Manages NoSQL collections: 'event_feedback' and 'system_audit_logs'.
 */
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventops';
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function getDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  return connectedClient.db('eventops');
}

export default clientPromise;

/**
 * MongoDB Aggregation Pipeline: Computes detailed feedback metrics for an event.
 */
export async function getEventFeedbackStats(eventId: number) {
  const db = await getDb();
  const collection = db.collection('event_feedback');

  const pipeline = [
    { $match: { event_id: eventId } },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              total_reviews: { $sum: 1 },
              average_rating: { $avg: '$rating' },
              average_content: { $avg: '$content_quality' },
              average_organization: { $avg: '$organization_rating' },
              average_venue: { $avg: '$venue_rating' },
              recommend_count: { $sum: { $cond: ['$would_recommend', 1, 0] } }
            }
          },
          {
            $project: {
              _id: 0,
              total_reviews: 1,
              average_rating: { $round: ['$average_rating', 2] },
              average_content: { $round: ['$average_content', 2] },
              average_organization: { $round: ['$average_organization', 2] },
              average_venue: { $round: ['$average_venue', 2] },
              recommend_percentage: {
                $round: [
                  { $multiply: [{ $divide: ['$recommend_count', { $max: [1, '$total_reviews'] }] }, 100] },
                  1
                ]
              }
            }
          }
        ],
        rating_breakdown: [
          { $group: { _id: '$rating', count: { $sum: 1 } } },
          { $sort: { _id: -1 as const } }
        ],
        top_tags: [
          { $unwind: '$tags' },
          { $group: { _id: '$tags', count: { $sum: 1 } } },
          { $sort: { count: -1 as const } },
          { $limit: 6 }
        ],
        recent_reviews: [
          { $sort: { created_at: -1 as const } },
          { $limit: 5 },
          {
            $project: {
              _id: 0,
              student_id: 1,
              rating: 1,
              comments: 1,
              tags: 1,
              would_recommend: 1,
              created_at: 1
            }
          }
        ]
      }
    }
  ];

  const results = await collection.aggregate(pipeline).toArray();
  const result = results[0];

  return {
    summary: result.summary[0] || {
      total_reviews: 0,
      average_rating: 0,
      average_content: 0,
      average_organization: 0,
      average_venue: 0,
      recommend_percentage: 0
    },
    rating_breakdown: result.rating_breakdown || [],
    top_tags: result.top_tags || [],
    recent_reviews: result.recent_reviews || []
  };
}

/**
 * MongoDB Aggregation Pipeline: Campus-wide feedback summary across all events.
 */
export async function getCampusFeedbackAnalytics() {
  const db = await getDb();
  const collection = db.collection('event_feedback');

  const pipeline = [
    {
      $group: {
        _id: '$event_id',
        review_count: { $sum: 1 },
        avg_rating: { $avg: '$rating' },
        would_recommend_count: { $sum: { $cond: ['$would_recommend', 1, 0] } }
      }
    },
    {
      $project: {
        _id: 0,
        event_id: '$_id',
        review_count: 1,
        avg_rating: { $round: ['$avg_rating', 2] },
        recommend_rate: {
          $round: [
            { $multiply: [{ $divide: ['$would_recommend_count', '$review_count'] }, 100] },
            1
          ]
        }
      }
    },
    { $sort: { avg_rating: -1 as const, review_count: -1 as const } }
  ];

  return collection.aggregate(pipeline).toArray();
}

/**
 * Audit Logger: Persists structured event/user actions into MongoDB.
 */
export async function logSystemAudit(params: {
  action: string;
  entityType: string;
  entityId?: number | string | null;
  actorId: number;
  actorEmail: string;
  actorRole: string;
  details?: Record<string, unknown>;
}) {
  const db = await getDb();
  const collection = db.collection('system_audit_logs');

  const logDoc = {
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    actor_id: params.actorId,
    actor_email: params.actorEmail,
    actor_role: params.actorRole,
    details: params.details || {},
    timestamp: new Date()
  };

  return collection.insertOne(logDoc);
}
