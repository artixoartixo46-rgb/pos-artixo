export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      banks: {
        Row: {
          bank_code: string
          bank_name: string
          created_at: string
          id: string
        }
        Insert: {
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
        }
        Update: {
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      cheque_print_history: {
        Row: {
          cheque_id: string
          cheque_number: string
          id: string
          ip_address: string | null
          print_type: string | null
          printed_at: string
          printed_by: string | null
          user_agent: string | null
        }
        Insert: {
          cheque_id: string
          cheque_number: string
          id?: string
          ip_address?: string | null
          print_type?: string | null
          printed_at?: string
          printed_by?: string | null
          user_agent?: string | null
        }
        Update: {
          cheque_id?: string
          cheque_number?: string
          id?: string
          ip_address?: string | null
          print_type?: string | null
          printed_at?: string
          printed_by?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cheque_print_history_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
        ]
      }
      cheques: {
        Row: {
          account_number: string | null
          amount: number
          amount_in_words: string
          bank_branch: string | null
          bank_name: string
          cheque_date: string
          cheque_number: string
          created_at: string
          created_by: string | null
          id: string
          last_printed_at: string | null
          last_printed_by: string | null
          payee_name: string
          print_count: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          amount: number
          amount_in_words: string
          bank_branch?: string | null
          bank_name: string
          cheque_date: string
          cheque_number: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_printed_at?: string | null
          last_printed_by?: string | null
          payee_name: string
          print_count?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          amount?: number
          amount_in_words?: string
          bank_branch?: string | null
          bank_name?: string
          cheque_date?: string
          cheque_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_printed_at?: string | null
          last_printed_by?: string | null
          payee_name?: string
          print_count?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          outstanding_balance: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          outstanding_balance?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          outstanding_balance?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_payment_history: {
        Row: {
          balance_after: number
          balance_before: number
          created_at: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          invoice_number: string
          payment_amount: number
          payment_date: string
          payment_method: string
          remarks: string | null
        }
        Insert: {
          balance_after: number
          balance_before: number
          created_at?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number: string
          payment_amount: number
          payment_date?: string
          payment_method: string
          remarks?: string | null
        }
        Update: {
          balance_after?: number
          balance_before?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          invoice_number?: string
          payment_amount?: number
          payment_date?: string
          payment_method?: string
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_payment_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "credit_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payment_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_receiving: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          location_id: string | null
          product_id: string | null
          quantity: number
          received_date: string
          vendor_id: string | null
        }
        Insert: {
          cost_price: number
          created_at?: string
          id?: string
          location_id?: string | null
          product_id?: string | null
          quantity: number
          received_date?: string
          vendor_id?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          location_id?: string | null
          product_id?: string | null
          quantity?: number
          received_date?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_receiving_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_receiving_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_receiving_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category: string | null
          cost: number | null
          created_at: string | null
          id: string
          image_url: string | null
          invoice_number: string | null
          min_stock_level: number | null
          name: string
          price: number
          qr_code_number: string | null
          stock_quantity: number | null
          sub_category: string | null
          updated_at: string | null
          warranty: string | null
          weight_kg: number | null
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          invoice_number?: string | null
          min_stock_level?: number | null
          name: string
          price: number
          qr_code_number?: string | null
          stock_quantity?: number | null
          sub_category?: string | null
          updated_at?: string | null
          warranty?: string | null
          weight_kg?: number | null
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          invoice_number?: string | null
          min_stock_level?: number | null
          name?: string
          price?: number
          qr_code_number?: string | null
          stock_quantity?: number | null
          sub_category?: string | null
          updated_at?: string | null
          warranty?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          balance: number | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number | null
          id: string
          invoice_number: string
          paid_amount: number | null
          payment_method: string | null
          sale_date: string | null
          status: string | null
          subtotal: number
          tax_amount: number | null
          total_amount: number
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          id?: string
          invoice_number: string
          paid_amount?: number | null
          payment_method?: string | null
          sale_date?: string | null
          status?: string | null
          subtotal: number
          tax_amount?: number | null
          total_amount: number
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          id?: string
          invoice_number?: string
          paid_amount?: number | null
          payment_method?: string | null
          sale_date?: string | null
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "credit_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string | null
          business_name: string | null
          cheque_left_offset_mm: number | null
          cheque_orientation: string | null
          cheque_test_mode: boolean | null
          cheque_top_offset_mm: number | null
          created_at: string
          currency: string | null
          currency_symbol: string | null
          id: string
          logo_url: string | null
          phone: string | null
          tax_rate: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          cheque_left_offset_mm?: number | null
          cheque_orientation?: string | null
          cheque_test_mode?: boolean | null
          cheque_top_offset_mm?: number | null
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          tax_rate?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_name?: string | null
          cheque_left_offset_mm?: number | null
          cheque_orientation?: string | null
          cheque_test_mode?: boolean | null
          cheque_top_offset_mm?: number | null
          created_at?: string
          currency?: string | null
          currency_symbol?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          tax_rate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      vendor_bills: {
        Row: {
          bill_image_url: string | null
          created_at: string
          id: string
          invoice_date: string
          invoice_number: string
          items: Json
          status: string
          total_amount: number
          vendor_id: string | null
        }
        Insert: {
          bill_image_url?: string | null
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number: string
          items?: Json
          status?: string
          total_amount?: number
          vendor_id?: string | null
        }
        Update: {
          bill_image_url?: string | null
          created_at?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          items?: Json
          status?: string
          total_amount?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_ledger: {
        Row: {
          balance: number
          bill_id: string | null
          created_at: string
          credit: number
          debit: number
          description: string
          id: string
          invoice_number: string | null
          transaction_date: string
          vendor_id: string | null
        }
        Insert: {
          balance?: number
          bill_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description: string
          id?: string
          invoice_number?: string | null
          transaction_date?: string
          vendor_id?: string | null
        }
        Update: {
          balance?: number
          bill_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string
          id?: string
          invoice_number?: string | null
          transaction_date?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_ledger_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "vendor_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ledger_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          created_at: string
          current_balance: number | null
          email: string | null
          gst_vat_number: string | null
          id: string
          name: string
          opening_balance: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          current_balance?: number | null
          email?: string | null
          gst_vat_number?: string | null
          id?: string
          name: string
          opening_balance?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          current_balance?: number | null
          email?: string | null
          gst_vat_number?: string | null
          id?: string
          name?: string
          opening_balance?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_invoice_number: { Args: never; Returns: string }
      get_next_cheque_number: { Args: never; Returns: string }
      get_next_qr_code_number: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
