# Optimization Brainstorm - Avoiding Repeated Data Fetches

## Current Problem Analysis

### What Gets Fetched Multiple Times?

#### 1. **send_queue table** (50,857 rows)
- Fetched for: Every "View Details" click
- Usage: Map messages to templates, count total/sent/failed per template
- **Issue:** Same campaign data fetched every time modal is opened

#### 2. **message_status_logs table** (121,679 rows)
- Fetched for: Every "View Details" click + Analytics page load
- Usage: Determine message delivery status
- **Issue:** Webhooks keep arriving, but 99% of data is already processed

#### 3. **messages table** (49,694 rows)
- Fetched for: Every "View Details" click + Analytics page
- Usage: Map message IDs to phone numbers, count replies
- **Issue:** This table is append-only for campaigns, rarely changes

#### 4. **campaign_contacts table** (50,857 rows)
- Fetched for: Every "View Details" click (now via DB function - optimized!)
- Usage: Contact distribution by template
- **Issue:** SOLVED - now aggregated in database

---

## Optimization Strategies

### **Strategy 1: Pre-computed Materialized Views** ⭐⭐⭐⭐⭐
**Best for: Completed campaigns**

#### Concept:
Create a PostgreSQL materialized view that pre-calculates template stats.

```sql
CREATE MATERIALIZED VIEW campaign_template_stats AS
SELECT
  c.id as campaign_id,
  sq.template_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE sq.status = 'sent') as sent,
  COUNT(*) FILTER (WHERE sq.status = 'failed') as failed,
  COUNT(DISTINCT CASE
    WHEN msl.status IN ('delivered', 'read')
    THEN msl.whatsapp_message_id
  END) as delivered,
  COUNT(DISTINCT CASE
    WHEN msl.status = 'read'
    THEN msl.whatsapp_message_id
  END) as read,
  COUNT(DISTINCT CASE
    WHEN msl.status = 'failed'
    THEN msl.whatsapp_message_id
  END) as failed_delivery
FROM campaigns c
JOIN send_queue sq ON c.id = sq.campaign_id
LEFT JOIN message_status_logs msl ON sq.whatsapp_message_id = msl.whatsapp_message_id
GROUP BY c.id, sq.template_name;

-- Create index for fast lookups
CREATE INDEX idx_campaign_template_stats_campaign_id
ON campaign_template_stats(campaign_id);
```

**Refresh Strategy:**
- **For completed campaigns:** Refresh once when campaign completes, never again
- **For running campaigns:** Refresh every 1-5 minutes via cron
- **For active campaigns:** Use live calculation (current method)

**Pros:**
- ✅ Single query instead of 275+ queries
- ✅ Load time: 30s → ~200ms (150x faster!)
- ✅ No memory overhead in Node.js
- ✅ Can add more complex aggregations without performance hit

**Cons:**
- ❌ Requires periodic refresh for running campaigns
- ❌ Slight delay (up to refresh interval) for real-time data
- ❌ Storage overhead (minimal - ~100 rows per campaign)

**Implementation Complexity:** Low
**Performance Gain:** MASSIVE (150x)

---

### **Strategy 2: Database-Side Stored Function** ⭐⭐⭐⭐
**Best for: Any campaign**

#### Concept:
Move ALL calculation logic to PostgreSQL function.

```sql
CREATE OR REPLACE FUNCTION get_campaign_template_stats(p_campaign_id UUID)
RETURNS TABLE (
  template_name TEXT,
  total BIGINT,
  sent BIGINT,
  delivered BIGINT,
  read BIGINT,
  replied BIGINT,
  failed BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_status AS (
    SELECT DISTINCT ON (whatsapp_message_id)
      whatsapp_message_id,
      status,
      campaign_id
    FROM message_status_logs
    WHERE campaign_id = p_campaign_id
    ORDER BY whatsapp_message_id, created_at DESC
  ),
  reply_counts AS (
    SELECT sq.template_name, COUNT(DISTINCT m_in.user_phone) as reply_count
    FROM send_queue sq
    JOIN messages m_out ON sq.whatsapp_message_id = m_out.whatsapp_message_id
    JOIN messages m_in ON m_out.user_phone = m_in.user_phone
      AND m_out.whatsapp_number_id = m_in.whatsapp_number_id
      AND m_in.direction = 'incoming'
    WHERE sq.campaign_id = p_campaign_id
    GROUP BY sq.template_name
  )
  SELECT
    sq.template_name,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE sq.status = 'sent') as sent,
    COUNT(DISTINCT ls.whatsapp_message_id)
      FILTER (WHERE ls.status IN ('delivered', 'read')) as delivered,
    COUNT(DISTINCT ls.whatsapp_message_id)
      FILTER (WHERE ls.status = 'read') as read,
    COALESCE(rc.reply_count, 0) as replied,
    COUNT(*) FILTER (WHERE sq.status = 'failed') +
      COUNT(DISTINCT ls.whatsapp_message_id)
        FILTER (WHERE ls.status = 'failed') as failed
  FROM send_queue sq
  LEFT JOIN latest_status ls ON sq.whatsapp_message_id = ls.whatsapp_message_id
  LEFT JOIN reply_counts rc ON sq.template_name = rc.template_name
  WHERE sq.campaign_id = p_campaign_id
  GROUP BY sq.template_name, rc.reply_count;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Usage:**
```javascript
const { data: templateStats } = await supabase
  .rpc('get_campaign_template_stats', { p_campaign_id: campaignId });
```

**Pros:**
- ✅ Single query instead of 275+
- ✅ Load time: 30s → ~5-8s (4-6x faster)
- ✅ Real-time data (no caching needed)
- ✅ PostgreSQL optimizes query execution
- ✅ Reduces network bandwidth (275 round-trips → 1)

**Cons:**
- ❌ Still processes 270k rows on each call
- ❌ More complex SQL to maintain
- ❌ Limited to PostgreSQL capabilities

**Implementation Complexity:** Medium
**Performance Gain:** High (4-6x)

---

### **Strategy 3: In-Memory Cache (Redis/Node.js Cache)** ⭐⭐⭐⭐
**Best for: Frequently accessed campaigns**

#### Concept:
Cache the calculated results in memory with TTL.

```javascript
const NodeCache = require('node-cache');
const campaignStatsCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60
});

async function getCampaignWithCache(campaignId) {
  const cacheKey = `campaign_stats_${campaignId}`;

  // Check cache first
  let stats = campaignStatsCache.get(cacheKey);
  if (stats) {
    console.log('✅ Serving from cache');
    return stats;
  }

  // Not in cache, calculate (current method)
  console.log('⏳ Calculating fresh stats...');
  stats = await calculateTemplateStats(campaignId);

  // Check if campaign is completed - cache longer
  const campaign = await getCampaignMetadata(campaignId);
  const ttl = campaign.status === 'completed' ? 3600 * 24 : 300; // 24h vs 5min

  campaignStatsCache.set(cacheKey, stats, ttl);
  return stats;
}
```

**Cache Invalidation Strategy:**
```javascript
// Invalidate on webhook arrival
webhookHandler.on('status_update', (campaignId) => {
  campaignStatsCache.del(`campaign_stats_${campaignId}`);
});

// Invalidate on campaign completion
campaignService.on('campaign_completed', (campaignId) => {
  // Recalculate and cache permanently
  calculateAndCacheForever(campaignId);
});
```

**Pros:**
- ✅ Load time: 30s → ~50ms (600x faster!) for cached data
- ✅ Easy to implement
- ✅ Flexible TTL based on campaign status
- ✅ No database changes needed
- ✅ Can invalidate on webhook arrival

**Cons:**
- ❌ Memory usage (per campaign: ~10-50KB)
- ❌ Cache invalidation complexity
- ❌ First load still slow
- ❌ Lost on server restart (unless using Redis)

**Implementation Complexity:** Low
**Performance Gain:** MASSIVE for cached hits (600x)

---

### **Strategy 4: Incremental Calculation** ⭐⭐⭐
**Best for: Running campaigns**

#### Concept:
Only process NEW data since last calculation.

```javascript
// Store last processed timestamp per campaign
const lastProcessed = {};

async function calculateTemplateStatsIncremental(campaignId) {
  const lastTime = lastProcessed[campaignId] || campaign.created_at;

  // Fetch only NEW status logs since last calculation
  const newStatusLogs = await supabase
    .from('message_status_logs')
    .select('*')
    .eq('campaign_id', campaignId)
    .gte('created_at', lastTime);

  // Load previous stats from cache/database
  const previousStats = await loadPreviousStats(campaignId);

  // Update only changed counters
  const updatedStats = updateStatsWithNewLogs(previousStats, newStatusLogs);

  lastProcessed[campaignId] = new Date();
  return updatedStats;
}
```

**Pros:**
- ✅ Only processes new webhooks (100-1000 vs 120k)
- ✅ Much faster for subsequent loads
- ✅ Real-time updates

**Cons:**
- ❌ Complex state management
- ❌ Need to store intermediate results
- ❌ Potential inconsistency if state lost
- ❌ First load still slow

**Implementation Complexity:** High
**Performance Gain:** High for subsequent loads

---

### **Strategy 5: Background Pre-calculation Worker** ⭐⭐⭐⭐⭐
**Best for: Production system**

#### Concept:
Calculate stats in background, serve pre-calculated results.

```javascript
// Worker process (runs continuously)
async function statsPrecalculationWorker() {
  while (true) {
    // Find campaigns that need stats update
    const campaigns = await supabase
      .from('campaigns')
      .select('id, status, stats_last_updated')
      .in('status', ['running', 'completed'])
      .or('stats_last_updated.is.null,stats_last_updated.lt.' + fiveMinutesAgo);

    for (const campaign of campaigns) {
      console.log(`Pre-calculating stats for campaign ${campaign.id}...`);

      const stats = await calculateTemplateStats(campaign.id);

      // Store in new table: campaign_computed_stats
      await supabase
        .from('campaign_computed_stats')
        .upsert({
          campaign_id: campaign.id,
          template_stats: stats,
          computed_at: new Date()
        });

      // Update timestamp
      await supabase
        .from('campaigns')
        .update({ stats_last_updated: new Date() })
        .eq('id', campaign.id);
    }

    await sleep(60000); // Every 1 minute
  }
}

// API endpoint just reads pre-calculated data
async function getCampaign(campaignId) {
  const [campaign, precomputedStats] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', campaignId).single(),
    supabase.from('campaign_computed_stats').select('*').eq('campaign_id', campaignId).single()
  ]);

  return {
    ...campaign.data,
    templateStats: precomputedStats.data.template_stats
  };
}
```

**New Database Table:**
```sql
CREATE TABLE campaign_computed_stats (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id),
  template_stats JSONB NOT NULL,
  computed_at TIMESTAMP NOT NULL,
  CONSTRAINT unique_campaign_stats UNIQUE(campaign_id)
);

CREATE INDEX idx_computed_stats_computed_at ON campaign_computed_stats(computed_at);
```

**Pros:**
- ✅ User always gets instant response (~200ms)
- ✅ Computation happens in background
- ✅ No blocking on user request
- ✅ Can run on separate server/worker process
- ✅ Stats always fresh (within 1-5 min)

**Cons:**
- ❌ Requires background worker setup
- ❌ Slightly stale data (up to refresh interval)
- ❌ More infrastructure complexity

**Implementation Complexity:** Medium
**Performance Gain:** MASSIVE for users (150x)

---

### **Strategy 6: Hybrid Approach** ⭐⭐⭐⭐⭐
**Best for: Production at scale**

#### Concept:
Combine multiple strategies based on campaign status.

```javascript
async function getCampaignOptimized(campaignId) {
  const campaign = await getCampaignMetadata(campaignId);

  // Strategy based on campaign status
  switch (campaign.status) {
    case 'completed':
      // Use materialized view (cached forever)
      return await getFromMaterializedView(campaignId);

    case 'running':
      // Use background pre-calculation
      return await getFromPrecomputedStats(campaignId);

    case 'scheduled':
    case 'failed':
      // No stats needed, return basic info
      return campaign;

    default:
      // Fallback to live calculation
      return await calculateLive(campaignId);
  }
}
```

**Pros:**
- ✅ Optimized for each scenario
- ✅ Best possible performance
- ✅ Real-time when needed, cached when possible

**Cons:**
- ❌ Most complex to implement
- ❌ More code paths to maintain

**Implementation Complexity:** High
**Performance Gain:** MAXIMUM

---

## Recommended Approach (Phased Implementation)

### **Phase 1: Quick Wins (Implement Now)** 🚀
1. **Database Function for Template Stats** (Strategy 2)
   - Reduces 275 queries → 1 query
   - 4-6x performance improvement
   - Low implementation complexity

2. **In-Memory Cache with Smart TTL** (Strategy 3)
   - Completed campaigns: 24h TTL
   - Running campaigns: 2-5min TTL
   - 600x improvement for cache hits

**Expected Result:**
- First load: 30s → 5-8s
- Subsequent loads: 5-8s → 50ms
- Overall improvement: ~60x average

---

### **Phase 2: Production Scale (Next Sprint)** 🏗️
3. **Background Pre-calculation Worker** (Strategy 5)
   - Run stats calculation in background
   - Users always get instant response
   - Worker updates stats every 1-5 minutes

**Expected Result:**
- ALL loads: ~200ms (150x improvement)
- No user waits for calculation
- Real-time within acceptable delay

---

### **Phase 3: Optimization** 🎯
4. **Materialized View for Completed Campaigns** (Strategy 1)
   - One-time calculation for historical data
   - Instant retrieval forever

**Expected Result:**
- Completed campaigns: ~50ms (600x improvement)
- Zero computation cost
- Perfect for analytics/reporting

---

## Data Freshness Comparison

| Strategy | Completed Campaigns | Running Campaigns | Real-time? |
|----------|-------------------|-------------------|------------|
| **Current** | ✅ Real-time | ✅ Real-time | Yes (30s) |
| **DB Function** | ✅ Real-time | ✅ Real-time | Yes (5-8s) |
| **Cache** | ⚠️ 24h stale | ⚠️ 5min stale | No |
| **Materialized View** | ⚠️ Frozen | ⚠️ 5min stale | No |
| **Background Worker** | ⚠️ 1min stale | ⚠️ 1min stale | Near real-time |
| **Hybrid** | ⚠️ Frozen | ⚠️ 1-5min stale | Near real-time |

---

## Impact Analysis

### Current System:
- Load time: 30 seconds
- Database load: 275 queries per request
- User experience: ❌ Poor (long wait)

### After Phase 1 (DB Function + Cache):
- First load: 5-8 seconds
- Cached load: 50ms
- Database load: 1 query per request (uncached)
- User experience: ✅ Good

### After Phase 2 (+ Background Worker):
- All loads: 200ms
- Database load: 1 simple query per request
- User experience: ✅ Excellent

### After Phase 3 (+ Materialized View):
- Completed campaigns: 50ms
- Running campaigns: 200ms
- Database load: Minimal
- User experience: ✅ Exceptional

---

## Storage Requirements

| Strategy | Storage Needed | Growth Rate |
|----------|---------------|-------------|
| Materialized View | ~10KB per campaign | Grows with campaigns |
| Computed Stats Table | ~10KB per campaign | Grows with campaigns |
| In-Memory Cache | ~10-50KB per active campaign | Fixed (LRU eviction) |
| Redis Cache | ~10-50KB per campaign | Configurable |

**For 1000 campaigns:** ~10-50MB total
**For 10,000 campaigns:** ~100-500MB total

---

## Conclusion

**Best Immediate Action:**
Implement **DB Function + Cache (Phase 1)** - gives 60x improvement with minimal complexity.

**Best Long-term Solution:**
**Hybrid Approach** - use materialized views for completed campaigns, background worker for running campaigns.

**Key Insight:**
The data being fetched is mostly STATIC for completed campaigns and changes SLOWLY for running campaigns.
We're re-calculating the same results over and over. Pre-computation is the answer!
