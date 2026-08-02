import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QRItem {
  itemCode: string
  itemName: string
  quantity: number
  unitPrice: number
  total: number
}

interface RequestBody {
  items: QRItem[]
}

// Validate individual item fields
function validateItem(item: any, index: number): { valid: boolean; error?: string } {
  if (!item.itemCode || typeof item.itemCode !== 'string') {
    return { valid: false, error: `Item ${index + 1}: Missing or invalid itemCode` }
  }
  if (!item.itemName || typeof item.itemName !== 'string') {
    return { valid: false, error: `Item ${index + 1}: Missing or invalid itemName` }
  }
  if (typeof item.quantity !== 'number' || item.quantity <= 0) {
    return { valid: false, error: `Item ${index + 1}: Invalid quantity` }
  }
  if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
    return { valid: false, error: `Item ${index + 1}: Invalid unitPrice` }
  }
  return { valid: true }
}

// Calculate total = quantity * unitPrice
function calculateTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('QR Add Items API called')

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Method not allowed. Use POST.',
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const body: RequestBody = await req.json()
    console.log('Received body:', JSON.stringify(body))

    // Validate items array exists
    if (!body.items || !Array.isArray(body.items)) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Invalid JSON or Missing "items" array',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (body.items.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Items array is empty',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const validItems: QRItem[] = []
    const errors: string[] = []

    // Validate and process each item
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]
      const validation = validateItem(item, i)

      if (!validation.valid) {
        errors.push(validation.error!)
        console.log(`Validation failed for item ${i}:`, validation.error)
        continue
      }

      // Recalculate total for verification
      const calculatedTotal = calculateTotal(item.quantity, item.unitPrice)
      
      validItems.push({
        itemCode: String(item.itemCode),
        itemName: String(item.itemName),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total: calculatedTotal,
      })
    }

    // If no valid items, return error
    if (validItems.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'No valid items found',
          errors: errors,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log(`Processed ${validItems.length} valid items, ${errors.length} errors`)

    // Return success response with processed items
    return new Response(
      JSON.stringify({
        status: 'success',
        message: 'QR items added to billing successfully',
        data: {
          savedItems: validItems,
          processedCount: validItems.length,
          errorCount: errors.length,
          errors: errors.length > 0 ? errors : undefined,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error processing QR items:', error)

    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof SyntaxError ? 'Invalid JSON format' : 'Internal server error',
      }),
      {
        status: error instanceof SyntaxError ? 400 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
